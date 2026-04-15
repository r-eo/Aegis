"""
simulate_telemetry.py
=====================
Streams rows from nasa_test2_features.csv to the backend WebSocket endpoint,
simulating a continuous vibration sensor feed.

The script loops through the CSV rows sequentially (and wraps around) so that
the dashboard always has live data regardless of how long it runs.

Usage (from repo root):
    python -m core_engine.simulate_telemetry
"""

import asyncio
import json
import os
import time

import pandas as pd
import websockets

# ──────────────────────────────────────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────────────────────────────────────
WS_URI         = os.environ.get("SIMULATE_WS_URI", "ws://localhost:8000/ws/telemetry")
STREAM_HZ      = float(os.environ.get("SIMULATE_HZ", "2"))   # rows per second
DATASETS_DIR   = os.path.join(os.path.dirname(__file__), "..", "datasets")
TEST_CSV_PATH  = os.path.join(DATASETS_DIR, "nasa_test2_features.csv")


def load_test_data() -> pd.DataFrame:
    """Load nasa_test2_features.csv (the test/simulation dataset)."""
    if not os.path.exists(TEST_CSV_PATH):
        raise FileNotFoundError(f"Test dataset not found: {TEST_CSV_PATH}")
    df = pd.read_csv(TEST_CSV_PATH)
    required = {"max_vibration", "rms_vibration"}
    if not required.issubset(df.columns):
        raise ValueError(f"Expected columns {required} in {TEST_CSV_PATH}, got {list(df.columns)}")
    df = df[["max_vibration", "rms_vibration"]].dropna().reset_index(drop=True)
    print(f"[Simulator] Loaded {len(df)} rows from nasa_test2_features.csv")
    return df


async def stream(df: pd.DataFrame):
    """Connect to the backend and stream rows indefinitely."""
    interval = 1.0 / STREAM_HZ
    total = len(df)
    idx = 0

    while True:
        try:
            print(f"[Simulator] Connecting to {WS_URI} ...")
            async with websockets.connect(WS_URI, ping_interval=20, ping_timeout=10) as ws:
                print("[Simulator] Connected. Streaming nasa_test2_features data...")
                while True:
                    row = df.iloc[idx % total]
                    payload = {
                        "timestamp": time.time(),
                        "max_vibration": float(row["max_vibration"]),
                        "rms_vibration": float(row["rms_vibration"]),
                        # Synthesise vib_x/y/z so the existing TelemetryProcessor
                        # can still function if the endpoint ever needs it.
                        # We encode max_vibration as the dominant axis.
                        "vib_x": float(row["max_vibration"]),
                        "vib_y": float(row["rms_vibration"]),
                        "vib_z": 0.0,
                    }
                    await ws.send(json.dumps(payload))
                    idx += 1
                    await asyncio.sleep(interval)
        except (websockets.exceptions.ConnectionClosed,
                websockets.exceptions.WebSocketException,
                ConnectionRefusedError) as e:
            print(f"[Simulator] Connection error: {e}. Retrying in 3 s …")
            await asyncio.sleep(3)
        except Exception as e:
            print(f"[Simulator] Unexpected error: {e}. Retrying in 5 s …")
            await asyncio.sleep(5)


if __name__ == "__main__":
    df = load_test_data()
    asyncio.run(stream(df))
