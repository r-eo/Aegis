import collections
import numpy as np

# Training data is in g-units. Max realistic vibration for industrial bearings is ~5g.
# If a client sends raw m/s² (e.g. gravity = 9.81), values will be > 5.
# We auto-detect and convert: if magnitude > MAX_G_THRESHOLD, assume m/s² and divide by G.
MAX_G_THRESHOLD = 5.0   # anything above 5g is almost certainly a unit error
G_CONSTANT      = 9.81  # m/s² per g


class TelemetryProcessor:
    def __init__(self, window_size=40):
        self.window_size = window_size
        self.buffer = collections.deque(maxlen=window_size)

    def add_data(self, vib_x: float, vib_y: float, vib_z: float):
        """
        Compute vector magnitude from 3-axis accelerometer reading and buffer it.

        Auto-corrects unit mismatches:
          - Training data uses g-units (0.3 g – 6.83 g range in datasets).
          - Some clients send raw m/s² (gravity = 9.81 m/s² ≈ 1 g).
          - If the computed magnitude exceeds MAX_G_THRESHOLD, we divide by G to convert.
          - This makes old/new clients with different units both work correctly.
        """
        magnitude = float(np.sqrt(vib_x**2 + vib_y**2 + vib_z**2))

        # Auto unit-correction: if value looks like m/s², convert to g
        if magnitude > MAX_G_THRESHOLD:
            magnitude = magnitude / G_CONSTANT

        # Final safety clamp — no real vibration exceeds 10g in our context
        magnitude = min(magnitude, 10.0)

        self.buffer.append(magnitude)

    def extract_features(self):
        if not self.buffer:
            return None, None

        magnitudes = np.array(self.buffer)
        max_vibration = float(np.max(magnitudes))
        rms_vibration = float(np.sqrt(np.mean(magnitudes**2)))

        return max_vibration, rms_vibration

    def reset(self):
        """Clear the rolling buffer (call this on client reconnect if needed)."""
        self.buffer.clear()
