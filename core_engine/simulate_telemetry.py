import asyncio
import websockets
import json
import time
import math
import random

async def simulate():
    uri = "ws://localhost:8000/ws/telemetry"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to WebSocket telemetry feed. Injecting mock data...")
            t = 0
            while True:
                # Add base vibration
                vib_x = math.sin(t) * 0.1 + random.uniform(-0.05, 0.05)
                vib_y = math.cos(t * 1.5) * 0.1 + random.uniform(-0.05, 0.05)
                vib_z = math.sin(t * 2.1) * 0.1 + random.uniform(-0.05, 0.05)
                
                # Introduce anomalies randomly
                if random.random() < 0.02:
                    vib_x += random.uniform(1.0, 3.0)
                    vib_y += random.uniform(1.0, 3.0)

                payload = {
                    "timestamp": time.time(),
                    "vib_x": vib_x,
                    "vib_y": vib_y,
                    "vib_z": vib_z
                }
                
                await websocket.send(json.dumps(payload))
                t += 0.1
                await asyncio.sleep(0.05) # ~20 Hz
    except websockets.exceptions.ConnectionClosed:
        print("WebSocket connection closed")
    except ConnectionRefusedError:
        print("Could not connect. Is the FastAPI backend running?")

if __name__ == "__main__":
    asyncio.run(simulate())
