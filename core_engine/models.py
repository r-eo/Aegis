from pydantic import BaseModel, Field
from typing import Optional


class TelemetryPayload(BaseModel):
    """Incoming accelerometer telemetry from phone."""
    vib_x: float = Field(..., description="Vibration on X axis (m/s²)")
    vib_y: float = Field(..., description="Vibration on Y axis (m/s²)")
    vib_z: float = Field(..., description="Vibration on Z axis (m/s²)")
    timestamp: Optional[float] = Field(None, description="Unix timestamp (seconds)")


class PCACoords(BaseModel):
    pc1: float
    pc2: float


class AnomalyScoreResult(BaseModel):
    """Outgoing anomaly result broadcast to all dashboard clients."""
    timestamp: float
    anomaly_score: float = Field(..., ge=0.0, le=1.0)
    max_vibration: float
    rms_vibration: float
    alert_status: str = Field(..., description="HEALTHY | WARNING | CRITICAL")
    pca: Optional[PCACoords] = None
