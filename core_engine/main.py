import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import time

from .models import TelemetryPayload, AnomalyScoreResult
from .telemetry_processor import TelemetryProcessor
from .ml_pipeline import MLPipeline

app = FastAPI(title="Project Aegis Core Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast_json(self, message: dict):
        # Create list to avoid modification during iteration
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except WebSocketDisconnect:
                self.disconnect(connection)

manager = ConnectionManager()
telemetry_processor = TelemetryProcessor(window_size=40)
ml_pipeline = MLPipeline()

@app.websocket("/ws/telemetry")
async def telemetry_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            
            ts = payload.get("timestamp", time.time())
            
            telemetry_processor.add_data(
                vib_x=payload.get("vib_x", 0.0),
                vib_y=payload.get("vib_y", 0.0),
                vib_z=payload.get("vib_z", 0.0)
            )
            
            max_vib, rms_vib = telemetry_processor.extract_features()
            
            if max_vib is not None and rms_vib is not None:
                ml_pipeline.add_calibration_data(max_vib, rms_vib)
                anomaly_score = ml_pipeline.predict(max_vib, rms_vib)
                
                alert_status = "HEALTHY"
                if anomaly_score > 0.7:
                    alert_status = "CRITICAL"
                elif anomaly_score > 0.4:
                    alert_status = "WARNING"
                
                result = AnomalyScoreResult(
                    timestamp=ts,
                    anomaly_score=anomaly_score,
                    max_vibration=max_vib,
                    rms_vibration=rms_vib,
                    alert_status=alert_status
                )
                
                await manager.broadcast_json(result.dict())
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
