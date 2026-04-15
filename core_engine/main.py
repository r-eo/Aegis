import asyncio
import json
import os
import time
import logging
from contextlib import asynccontextmanager
from typing import List

import pandas as pd
import websockets
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .telemetry_processor import TelemetryProcessor
from .ml_pipeline import MLPipeline

# ─────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────
# Global singletons (created at startup)
# ─────────────────────────────────────────────────────────────
ml_pipeline: MLPipeline = None
telemetry_processor: TelemetryProcessor = None


# ─────────────────────────────────────────────────────────────
# Internal CSV Simulator (nasa_test2_features → WebSocket)
# ─────────────────────────────────────────────────────────────
DATASETS_DIR  = os.path.join(os.path.dirname(__file__), "..", "datasets")
TEST_CSV_PATH = os.path.join(DATASETS_DIR, "nasa_test2_features.csv")
SIMULATOR_HZ  = float(os.environ.get("SIMULATE_HZ", "2"))   # rows per second


async def _run_csv_simulator():
    """
    Background task: stream rows from nasa_test2_features.csv into
    the /ws/telemetry endpoint at SIMULATOR_HZ rows/second, looping forever.
    The simulator connects to the local server over WebSocket so the ML
    pipeline and broadcast logic are reused transparently.
    """
    # Give the server a moment to finish binding before we connect
    await asyncio.sleep(3)

    try:
        df = pd.read_csv(TEST_CSV_PATH)[["max_vibration", "rms_vibration"]].dropna().reset_index(drop=True)
        logger.info("[Simulator] Loaded %d rows from nasa_test2_features.csv", len(df))
    except Exception as e:
        logger.error("[Simulator] Could not load test CSV: %s", e)
        return

    total    = len(df)
    idx      = 0
    interval = 1.0 / SIMULATOR_HZ

    # Determine the local WebSocket URL (same process, loopback)
    port = int(os.environ.get("PORT", 8000))
    local_ws = f"ws://127.0.0.1:{port}/ws/telemetry"

    while True:
        try:
            logger.info("[Simulator] Connecting to %s ...", local_ws)
            async with websockets.connect(local_ws, ping_interval=20, ping_timeout=10) as ws:
                logger.info("[Simulator] Connected — streaming nasa_test2 @ %.1f Hz", SIMULATOR_HZ)
                while True:
                    row = df.iloc[idx % total]
                    payload = json.dumps({
                        "timestamp": time.time(),
                        "max_vibration": float(row["max_vibration"]),
                        "rms_vibration": float(row["rms_vibration"]),
                    })
                    await ws.send(payload)
                    idx += 1
                    await asyncio.sleep(interval)
        except asyncio.CancelledError:
            logger.info("[Simulator] Cancelled — shutting down.")
            return
        except Exception as e:
            logger.warning("[Simulator] Connection error (%s). Retrying in 5 s …", e)
            await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Train the model at startup, launch CSV simulator, clean up on shutdown."""
    global ml_pipeline, telemetry_processor
    logger.info("🚀 Project Aegis Core Engine starting up...")
    telemetry_processor = TelemetryProcessor(window_size=40)
    ml_pipeline = MLPipeline(contamination=0.05)
    logger.info("✅ Startup complete — ready to accept connections.")

    # Start the internal nasa_test2 CSV simulator as a background task
    sim_task = asyncio.create_task(_run_csv_simulator())
    logger.info("🎬 CSV simulator task scheduled.")

    yield

    logger.info("🛑 Shutting down...")
    sim_task.cancel()
    try:
        await sim_task
    except asyncio.CancelledError:
        pass


# ─────────────────────────────────────────────────────────────
# FastAPI app
# ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="Project Aegis Core Engine",
    description=(
        "Predictive maintenance platform — real-time anomaly detection via IsolationForest. "
        "Trained on nasa_test4_features; streamed via nasa_test2_features simulation."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # Tightened in production via env var
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────
# WebSocket Connection Manager
# ─────────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"Client connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"Client disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast_json(self, message: dict):
        dead = []
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                dead.append(connection)
        for d in dead:
            self.disconnect(d)


manager = ConnectionManager()


# ─────────────────────────────────────────────────────────────
# REST Endpoints
# ─────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "service": "Project Aegis Core Engine", "version": "1.0.0"}


@app.get("/health", tags=["Health"])
async def health():
    return {
        "status": "healthy",
        "model_ready": ml_pipeline.is_trained if ml_pipeline else False,
        "active_websocket_connections": len(manager.active_connections),
        "timestamp": time.time(),
    }


@app.get("/api/model-info", tags=["Analytics"])
async def model_info():
    """Return metadata about the trained IsolationForest model."""
    if not ml_pipeline:
        raise HTTPException(status_code=503, detail="ML pipeline not initialized")
    return JSONResponse(content=ml_pipeline.get_model_info())


@app.get("/api/pca-analytics", tags=["Analytics"])
async def pca_analytics():
    """
    Return PCA scatter data from training datasets.
    Used by the Command Center dashboard to render PCA visualization.
    """
    if not ml_pipeline:
        raise HTTPException(status_code=503, detail="ML pipeline not initialized")
    data = ml_pipeline.get_pca_analytics()
    return JSONResponse(content=data)


@app.get("/api/dataset-stats", tags=["Analytics"])
async def dataset_stats():
    """Return key statistics about the training data (nasa_test4_features)."""
    if not ml_pipeline or ml_pipeline.training_data_cache is None:
        raise HTTPException(status_code=503, detail="Training data not available")

    df = ml_pipeline.training_data_cache
    stats = {
        "total_samples": len(df),
        "train_dataset": "nasa_test4_features (4 bearings)",
        "test_dataset": "nasa_test2_features (simulation stream)",
        "anomaly_count": int(df["is_anomaly"].sum()),
        "normal_count": int((~df["is_anomaly"]).sum()),
        "anomaly_rate": round(float(df["is_anomaly"].mean()), 4),
        "max_vibration": {
            "min": round(float(df["max_vibration"].min()), 4),
            "max": round(float(df["max_vibration"].max()), 4),
            "mean": round(float(df["max_vibration"].mean()), 4),
            "std": round(float(df["max_vibration"].std()), 4),
        },
        "rms_vibration": {
            "min": round(float(df["rms_vibration"].min()), 4),
            "max": round(float(df["rms_vibration"].max()), 4),
            "mean": round(float(df["rms_vibration"].mean()), 4),
            "std": round(float(df["rms_vibration"].std()), 4),
        },
        "sources": df["source"].value_counts().to_dict(),
    }
    return JSONResponse(content=stats)


@app.post("/api/score", tags=["Inference"])
async def score_single(payload: dict):
    """
    REST endpoint to score a single telemetry reading.
    Body: { "max_vibration": 0.5, "rms_vibration": 0.12 }
    """
    if not ml_pipeline:
        raise HTTPException(status_code=503, detail="ML pipeline not initialized")
    
    max_vib = float(payload.get("max_vibration", 0.0))
    rms_vib = float(payload.get("rms_vibration", 0.0))
    score = ml_pipeline.predict(max_vib, rms_vib)
    pca_coords = ml_pipeline.predict_pca(max_vib, rms_vib)
    
    alert = "HEALTHY"
    if score > 0.7:
        alert = "CRITICAL"
    elif score > 0.4:
        alert = "WARNING"

    return {
        "anomaly_score": round(score, 4),
        "alert_status": alert,
        "pca": pca_coords,
        "timestamp": time.time(),
    }


# ─────────────────────────────────────────────────────────────
# WebSocket — Real-time Telemetry
# ─────────────────────────────────────────────────────────────

@app.websocket("/ws/telemetry")
async def telemetry_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time vibration telemetry.

    Accepts two payload formats:

    Format A — Pre-computed features (from nasa_test2 simulator):
        {
            "timestamp": 1234567890.0,
            "max_vibration": 0.45,
            "rms_vibration": 0.078,
            "vib_x": ..., "vib_y": ..., "vib_z": ...   # optional / ignored
        }
        When max_vibration and rms_vibration are present, they are used directly
        (no rolling-window processing needed).

    Format B — Raw tri-axis acceleration:
        { "vib_x": 0.1, "vib_y": -0.2, "vib_z": 0.9, "timestamp": 1234567890.0 }
        Features are extracted via the rolling TelemetryProcessor window.

    Broadcast JSON (to all connected clients):
        {
            "timestamp": ...,
            "anomaly_score": 0.0–1.0,
            "max_vibration": ...,
            "rms_vibration": ...,
            "alert_status": "HEALTHY|WARNING|CRITICAL",
            "pca": { "pc1": ..., "pc2": ... }
        }
    """
    await manager.connect(websocket)
    telemetry_processor.reset()   # flush any stale buffer from previous session
    logger.info("Buffer reset for new WebSocket connection.")
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON"})
                continue

            ts = payload.get("timestamp", time.time())

            # ── Format A: pre-computed features from the CSV simulator ────────
            if "max_vibration" in payload and "rms_vibration" in payload:
                max_vib = float(payload["max_vibration"])
                rms_vib = float(payload["rms_vibration"])

            # ── Format B: raw tri-axis acceleration (rolling window) ──────────
            else:
                vib_x = float(payload.get("vib_x", 0.0))
                vib_y = float(payload.get("vib_y", 0.0))
                vib_z = float(payload.get("vib_z", 0.0))

                telemetry_processor.add_data(vib_x, vib_y, vib_z)
                max_vib, rms_vib = telemetry_processor.extract_features()

                if max_vib is None or rms_vib is None:
                    await websocket.send_json({
                        "status": "buffering",
                        "buffer_size": len(telemetry_processor.buffer),
                        "timestamp": ts,
                    })
                    continue

            # ── ML inference ──────────────────────────────────────────────────
            anomaly_score = ml_pipeline.predict(max_vib, rms_vib)
            pca_coords    = ml_pipeline.predict_pca(max_vib, rms_vib)

            # ── Alert classification ──────────────────────────────────────────
            alert_status = "HEALTHY"
            if anomaly_score > 0.7:
                alert_status = "CRITICAL"
            elif anomaly_score > 0.4:
                alert_status = "WARNING"

            result = {
                "timestamp": ts,
                "anomaly_score": round(anomaly_score, 4),
                "max_vibration": round(max_vib, 4),
                "rms_vibration": round(rms_vib, 4),
                "alert_status": alert_status,
                "pca": {
                    "pc1": round(pca_coords["pc1"], 4),
                    "pc2": round(pca_coords["pc2"], 4),
                },
            }

            # Broadcast to all connected clients (dashboard viewers)
            await manager.broadcast_json(result)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)
