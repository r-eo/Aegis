import asyncio
import json
import os
import time
import logging
from collections import deque
from contextlib import asynccontextmanager
from typing import List

import numpy as np
import pandas as pd
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .telemetry_processor import TelemetryProcessor
from .ml_pipeline import MLPipeline

# ─────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Globals
# ─────────────────────────────────────────────────────────────
ml_pipeline: MLPipeline           = None
telemetry_processor: TelemetryProcessor = None
simulator_running: bool           = False   # user requested the manual start/stop button back
mape_window: deque                = deque(maxlen=50)  # rolling window for MAPE


# ─────────────────────────────────────────────────────────────
# WebSocket Connection Manager
# ─────────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info("Client connected. Total: %d", len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info("Client disconnected. Total: %d", len(self.active_connections))

    async def broadcast_json(self, message: dict):
        dead = []
        for ws in list(self.active_connections):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for d in dead:
            self.disconnect(d)


manager = ConnectionManager()

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────
DATASETS_DIR  = os.path.join(os.path.dirname(__file__), "..", "datasets")
TEST_CSV_PATH = os.path.join(DATASETS_DIR, "nasa_test2_features.csv")
SIMULATOR_HZ  = float(os.environ.get("SIMULATE_HZ", "2"))


def _classify(score: float) -> str:
    if score > 0.7:
        return "CRITICAL"
    if score > 0.4:
        return "WARNING"
    return "HEALTHY"


def _calc_mape(window: deque) -> float:
    """
    Streaming MAPE — measures how much each incoming reading deviates
    from the rolling mean of the last N readings.

        MAPE = mean(|xi - x̄| / x̄) × 100

    Gives judges a live error-rate % that rises as the signal degrades.
    """
    if len(window) < 2:
        return 0.0
    arr  = np.array(window)
    mean = arr.mean()
    if mean == 0:
        return 0.0
    mape = np.mean(np.abs(arr - mean) / mean) * 100
    return round(float(mape), 3)


# ─────────────────────────────────────────────────────────────
# In-process CSV Simulator  (nasa_test2_features)
# ─────────────────────────────────────────────────────────────
async def _run_csv_simulator():
    global simulator_running
    await asyncio.sleep(2)   # wait for server to fully start

    try:
        df = (
            pd.read_csv(TEST_CSV_PATH)[["max_vibration", "rms_vibration"]]
            .dropna()
            .reset_index(drop=True)
        )
        logger.info("[Simulator] Loaded %d rows from nasa_test2_features.csv", len(df))
    except Exception as e:
        logger.error("[Simulator] Could not load test CSV: %s", e)
        return

    total    = len(df)
    idx      = 0
    interval = 1.0 / SIMULATOR_HZ

    while True:
        try:
            if not simulator_running:
                await asyncio.sleep(0.2)
                continue

            row     = df.iloc[idx % total]
            max_vib = float(row["max_vibration"])
            rms_vib = float(row["rms_vibration"])

            # Rolling MAPE window (tracking max_vibration signal)
            mape_window.append(max_vib)
            streaming_mape = _calc_mape(mape_window)

            # ML inference
            score      = ml_pipeline.predict(max_vib, rms_vib)
            pca_coords = ml_pipeline.predict_pca(max_vib, rms_vib)

            result = {
                "timestamp":      time.time(),
                "anomaly_score":  round(score, 4),
                "max_vibration":  round(max_vib, 4),
                "rms_vibration":  round(rms_vib, 4),
                "alert_status":   _classify(score),
                "streaming_mape": streaming_mape,
                "row_index":      idx % total,
                "total_rows":     total,
                "pca": {
                    "pc1": round(pca_coords["pc1"], 4),
                    "pc2": round(pca_coords["pc2"], 4),
                },
            }

            await manager.broadcast_json(result)
            idx += 1
            await asyncio.sleep(interval)

        except asyncio.CancelledError:
            return
        except Exception as e:
            logger.warning("[Simulator] Error: %s", e)
            await asyncio.sleep(1)


# ─────────────────────────────────────────────────────────────
# Lifespan
# ─────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global ml_pipeline, telemetry_processor
    logger.info("🚀 Aegis Core Engine starting...")
    telemetry_processor = TelemetryProcessor(window_size=40)
    ml_pipeline = MLPipeline(contamination=0.05)
    logger.info("✅ ML pipeline ready.")

    sim_task = asyncio.create_task(_run_csv_simulator())
    logger.info("🎬 Simulator task started (continuous streaming).")

    yield

    sim_task.cancel()
    try:
        await sim_task
    except asyncio.CancelledError:
        pass


# ─────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="Project Aegis Core Engine",
    description="Predictive maintenance via IsolationForest | train=nasa_test4 | stream=nasa_test2",
    version="2.0.0",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


# ─────────────────────────────────────────────────────────────
# REST — Health / Control
# ─────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "service": "Project Aegis Core Engine", "version": "2.0.0"}


@app.get("/health", tags=["Health"])
async def health():
    return {
        "status": "healthy",
        "model_ready": ml_pipeline.is_trained if ml_pipeline else False,
        "simulator_running": simulator_running,
        "active_ws_connections": len(manager.active_connections),
        "simulator_hz": SIMULATOR_HZ,
        "timestamp": time.time(),
    }


@app.post("/api/simulator/start", tags=["Control"])
async def simulator_start():
    global simulator_running
    simulator_running = True
    mape_window.clear()
    logger.info("[API] Simulator STARTED")
    return {"status": "started", "simulator_hz": SIMULATOR_HZ}


@app.post("/api/simulator/stop", tags=["Control"])
async def simulator_stop():
    global simulator_running
    simulator_running = False
    logger.info("[API] Simulator STOPPED")
    return {"status": "stopped"}


@app.get("/api/simulator/status", tags=["Control"])
async def simulator_status():
    return {
        "running": simulator_running,
        "hz": SIMULATOR_HZ,
        "mape_window_size": len(mape_window),
        "current_mape": _calc_mape(mape_window),
    }


# ─────────────────────────────────────────────────────────────
# REST — Analytics
# ─────────────────────────────────────────────────────────────
@app.get("/api/model-info", tags=["Analytics"])
async def model_info():
    if not ml_pipeline:
        raise HTTPException(status_code=503, detail="ML pipeline not initialized")
    return JSONResponse(content=ml_pipeline.get_model_info())


@app.get("/api/pca-analytics", tags=["Analytics"])
async def pca_analytics():
    if not ml_pipeline:
        raise HTTPException(status_code=503, detail="ML pipeline not initialized")
    return JSONResponse(content=ml_pipeline.get_pca_analytics())


@app.get("/api/dataset-stats", tags=["Analytics"])
async def dataset_stats():
    if not ml_pipeline or ml_pipeline.training_data_cache is None:
        raise HTTPException(status_code=503, detail="Training data not available")
    df = ml_pipeline.training_data_cache
    return JSONResponse(content={
        "total_samples":  len(df),
        "train_dataset":  "nasa_test4_features (4 bearings)",
        "test_dataset":   "nasa_test2_features (simulation stream)",
        "anomaly_count":  int(df["is_anomaly"].sum()),
        "normal_count":   int((~df["is_anomaly"]).sum()),
        "anomaly_rate":   round(float(df["is_anomaly"].mean()), 4),
        "max_vibration": {
            "min":  round(float(df["max_vibration"].min()),  4),
            "max":  round(float(df["max_vibration"].max()),  4),
            "mean": round(float(df["max_vibration"].mean()), 4),
            "std":  round(float(df["max_vibration"].std()),  4),
        },
        "rms_vibration": {
            "min":  round(float(df["rms_vibration"].min()),  4),
            "max":  round(float(df["rms_vibration"].max()),  4),
            "mean": round(float(df["rms_vibration"].mean()), 4),
            "std":  round(float(df["rms_vibration"].std()),  4),
        },
    })


# ─────────────────────────────────────────────────────────────
# WebSocket
# ─────────────────────────────────────────────────────────────
@app.websocket("/ws/telemetry")
async def telemetry_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    # Send simulator status immediately on connect
    await websocket.send_json({"type": "status", "simulator_running": simulator_running})
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if payload.get("ping"):
                await websocket.send_json({"pong": True})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error("WebSocket error: %s", e)
        manager.disconnect(websocket)
