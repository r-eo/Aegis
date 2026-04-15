import collections
import numpy as np

class TelemetryProcessor:
    def __init__(self, window_size=40):
        self.window_size = window_size
        self.buffer = collections.deque(maxlen=window_size)
        
    def add_data(self, vib_x: float, vib_y: float, vib_z: float):
        # Calculate Vector Magnitude: sqrt(X^2 + Y^2 + Z^2)
        magnitude = np.sqrt(vib_x**2 + vib_y**2 + vib_z**2)
        self.buffer.append(magnitude)
        
    def extract_features(self):
        if not self.buffer:
            return None, None
            
        magnitudes = np.array(self.buffer)
        max_vibration = np.max(magnitudes)
        rms_vibration = np.sqrt(np.mean(magnitudes**2))
        
        return float(max_vibration), float(rms_vibration)
