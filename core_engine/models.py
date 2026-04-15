from pydantic import BaseModel

class TelemetryPayload(BaseModel):
    timestamp: float
    vib_x: float
    vib_y: float
    vib_z: float

class AnomalyScoreResult(BaseModel):
    timestamp: float
    anomaly_score: float
    max_vibration: float
    rms_vibration: float
    alert_status: str
