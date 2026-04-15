from sklearn.ensemble import IsolationForest
import numpy as np

class MLPipeline:
    def __init__(self, contamination=0.05):
        self.model = IsolationForest(contamination=contamination, random_state=42)
        self.is_calibrated = False
        self.calibration_data = []
        self.calibration_size = 200 # approx 10 seconds at 20Hz
        
    def add_calibration_data(self, max_vib, rms_vib):
        if not self.is_calibrated:
            self.calibration_data.append([max_vib, rms_vib])
            if len(self.calibration_data) >= self.calibration_size:
                self.calibrate()
                
    def calibrate(self):
        if len(self.calibration_data) >= self.calibration_size:
            X = np.array(self.calibration_data)
            self.model.fit(X)
            self.is_calibrated = True
            
    def predict(self, max_vib, rms_vib):
        if not self.is_calibrated:
            return 0.0 # Return 0 score while gathering baseline measurements
            
        X = np.array([[max_vib, rms_vib]])
        # score_samples returns values ~ -0.5 for normal, more negative for anomalies
        raw_score = self.model.score_samples(X)[0]
        
        # Simple mapping to an anomaly score between 0 to 1
        # E.g. normalized where scores < -0.6 get mapped towards 1.0 (Critical)
        norm_score = max(0.0, min(1.0, 1.0 - (1.0 / (1.0 + np.exp(-raw_score * -5.0)))))
        
        # Another standard way mapping -1 for outliers, 1 for inliers
        # if self.model.predict(X)[0] == -1: return 0.8
        
        # Placeholder score mapping logic for demo:
        # We will refine this after testing with true datasets
        anomaly_score = float(1.0 - (raw_score + 0.5) * 2) 
        anomaly_score = max(0.0, min(1.0, anomaly_score))
        return anomaly_score
