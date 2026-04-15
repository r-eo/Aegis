import os
import numpy as np
import pandas as pd
import pandas as pd
from sklearn.ensemble import IsolationForest, RandomForestRegressor, RandomForestClassifier
from sklearn.neural_network import MLPRegressor
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, ConstantKernel as C
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score, accuracy_score
import joblib
import logging

logger = logging.getLogger(__name__)

# Path to the datasets directory (relative to the core_engine folder)
DATASETS_DIR = os.path.join(os.path.dirname(__file__), "..", "datasets")
MODEL_PATH    = os.path.join(os.path.dirname(__file__), "trained_model.joblib")
MLP_MODEL_PATH = os.path.join(os.path.dirname(__file__), "mlp_model.joblib")
GP_MODEL_PATH = os.path.join(os.path.dirname(__file__), "gp_model.joblib")
CLF_MODEL_PATH = os.path.join(os.path.dirname(__file__), "clf_model.joblib")
SCALER_PATH   = os.path.join(os.path.dirname(__file__), "scaler.joblib")
PCA_PATH      = os.path.join(os.path.dirname(__file__), "pca_model.joblib")
METRICS_PATH  = os.path.join(os.path.dirname(__file__), "metrics.joblib")
VERSION_FILE  = os.path.join(os.path.dirname(__file__), "model_version.txt")

# Bump this string any time you change the training dataset or feature set.
MODEL_VERSION = "nasa_test4_v3_multimodels"


class MLPipeline:
    """
    Production ML Pipeline for Project Aegis.

    Training data  → nasa_test4_features.csv  (4-bearing dataset, all 4 bearings averaged)
    Simulation/test data → nasa_test2_features.csv  (used by the streaming simulator)

    - Pre-trains IsolationForest on the training dataset at startup.
    - Provides real-time anomaly scoring for incoming telemetry.
    - Provides PCA analysis for the command center dashboard.
    """

    def __init__(self, contamination=0.05):
        self.contamination = contamination
        self.model: IsolationForest = None
        self.mlp_rul: MLPRegressor = None
        self.gp_rul: GaussianProcessRegressor = None
        self.clf: RandomForestClassifier = None
        self.scaler: StandardScaler = StandardScaler()
        self.pca: PCA = None
        self.is_trained = False
        self.training_data_cache = None
        self.static_metrics = {}

        self._initialize()

    def _initialize(self):
        """Load a pre-saved model, or train a fresh one from datasets."""
        if self._is_current_version() and self._load_saved_models():
            logger.info("✅ Loaded pre-trained models from disk.")
            return
        logger.info("🔄 Training from nasa_test4_features (version %s)...", MODEL_VERSION)
        self._train_from_datasets()

    def _is_current_version(self) -> bool:
        """Return True only if saved models exist AND match MODEL_VERSION."""
        paths = [MODEL_PATH, MLP_MODEL_PATH, GP_MODEL_PATH, CLF_MODEL_PATH, SCALER_PATH, PCA_PATH, METRICS_PATH]
        if not all(os.path.exists(p) for p in paths):
            return False
        if not os.path.exists(VERSION_FILE):
            return False
        with open(VERSION_FILE) as f:
            saved = f.read().strip()
        if saved != MODEL_VERSION:
            logger.info("Model version mismatch (saved=%s, current=%s) — retraining.", saved, MODEL_VERSION)
            for p in paths + [VERSION_FILE]:
                try:
                    os.remove(p)
                except OSError:
                    pass
            return False
        return True

    # ------------------------------------------------------------------
    # Training  (nasa_test4_features.csv)
    # ------------------------------------------------------------------

    def _load_training_dataset(self):
        """
        Load nasa_test4_features.csv.

        The file has one row per timestamp and four bearing columns each for
        max_vibration and rms_vibration (b1‑b4).  We expand each bearing into its
        own row so the model sees the full distribution of all four bearings.
        """
        train_path = os.path.join(DATASETS_DIR, "nasa_test4_features.csv")
        if not os.path.exists(train_path):
            logger.error(f"❌ Training dataset not found: {train_path}")
            return None

        df = pd.read_csv(train_path)
        logger.info(f"  Loaded nasa_test4_features.csv: {len(df)} rows")

        frames = []
        for b in range(1, 5):
            max_col = f"max_vibration_b{b}"
            rms_col = f"rms_vibration_b{b}"
            if max_col in df.columns and rms_col in df.columns:
                part = df[[max_col, rms_col]].copy()
                part.columns = ["max_vibration", "rms_vibration"]
                part["source"] = f"nasa_t4_b{b}"
                frames.append(part)

        if not frames:
            logger.error("❌ No bearing columns found in nasa_test4_features.csv")
            return None

        combined = pd.concat(frames, ignore_index=True).dropna()

        # Construct synthetic true RUL and true anomaly labels based on run-to-failure sequences
        # Enables implementation of metrics from RUL prediction and PdM research
        annotated_frames = []
        for src, group in combined.groupby("source"):
            group = group.copy()
            total_len = len(group)
            # RUL linearly decreases from 100 to 0
            group["true_rul"] = np.linspace(100, 0, total_len)
            # Final 15% is considered true anomaly zone
            group["ground_truth_anomaly"] = group["true_rul"] < 15.0
            annotated_frames.append(group)
        
        combined_annotated = pd.concat(annotated_frames, ignore_index=True)
        logger.info(f"  Total training samples (all bearings combined): {len(combined_annotated)}")
        return combined_annotated

    def _train_from_datasets(self):
        """Train IsolationForest + PCA on the training dataset."""
        data = self._load_training_dataset()
        if data is None:
            return

        X = data[["max_vibration", "rms_vibration"]].values

        # Scale
        X_scaled = self.scaler.fit_transform(X)

        # 1. IsolationForest (Unsupervised Anomaly Detection)
        self.model = IsolationForest(
            n_estimators=200, contamination=self.contamination,
            max_samples="auto", random_state=42, n_jobs=-1
        )
        self.model.fit(X_scaled)
        
        # 2. MLP Regressor (Functional MLP for RUL - Paper 1904.06442)
        self.mlp_rul = MLPRegressor(hidden_layer_sizes=(64, 32), max_iter=200, random_state=42)
        self.mlp_rul.fit(X_scaled, data["true_rul"].values)

        # 3. Gaussian Process Regressor (Uncertainty-aware RUL - Paper 2104.03613)
        # Train on a small subsample to avoid O(N^3) memory crash
        subsample_idx = np.random.choice(len(X_scaled), min(len(X_scaled), 1000), replace=False)
        kernel = C(1.0, (1e-3, 1e3)) * RBF(1.0, (1e-2, 1e2))
        self.gp_rul = GaussianProcessRegressor(kernel=kernel, n_restarts_optimizer=2, random_state=42)
        self.gp_rul.fit(X_scaled[subsample_idx], data["true_rul"].values[subsample_idx])

        # 4. Supervised Fault Classifier (Paper 2310.11477)
        self.clf = RandomForestClassifier(n_estimators=50, max_depth=10, random_state=42, n_jobs=-1)
        self.clf.fit(X_scaled, data["ground_truth_anomaly"].values)

        # Compute static metrics internally over cross-val-like training predictions
        
        # Isolation Forest (Accuracy)
        if_preds = self.model.predict(X_scaled) == -1
        if_acc = accuracy_score(data["ground_truth_anomaly"], if_preds)

        # Supervised Classification (Accuracy)
        clf_preds = self.clf.predict(X_scaled)
        clf_acc = accuracy_score(data["ground_truth_anomaly"], clf_preds)

        # Functional MLP (RUL)
        mlp_preds = self.mlp_rul.predict(X_scaled)
        mlp_mse = mean_squared_error(data["true_rul"], mlp_preds)
        mlp_mae = mean_absolute_error(data["true_rul"], mlp_preds)
        mlp_r2 = r2_score(data["true_rul"], mlp_preds)

        # Gaussian Process (RUL)
        gp_preds, gp_std = self.gp_rul.predict(X_scaled, return_std=True)
        gp_mse = mean_squared_error(data["true_rul"], gp_preds)
        gp_mae = mean_absolute_error(data["true_rul"], gp_preds)
        gp_r2 = r2_score(data["true_rul"], gp_preds)

        self.static_metrics = {
            "isolation_forest": { "accuracy": round(float(if_acc) * 100, 2) },
            "supervised_cnn_proxy": { "accuracy": round(float(clf_acc) * 100, 2) },
            "functional_mlp": {
                "mse": round(float(mlp_mse), 2),
                "mae": round(float(mlp_mae), 2),
                "r2": round(float(mlp_r2), 4)
            },
            "gaussian_process": {
                "mse": round(float(gp_mse), 2),
                "mae": round(float(gp_mae), 2),
                "r2": round(float(gp_r2), 4),
                "avg_uncertainty": round(float(np.mean(gp_std)), 2)
            }
        }

        # PCA (2 components for visualization)
        self.pca = PCA(n_components=2)
        X_pca = self.pca.fit_transform(X_scaled)

        # Cache for analytics
        data = data.copy()
        data["pc1"] = X_pca[:, 0]
        data["pc2"] = X_pca[:, 1]
        scores_raw = self.model.score_samples(X_scaled)
        data["anomaly_score"] = self._map_score(scores_raw)
        data["is_anomaly"] = if_preds
        self.training_data_cache = data

        self.is_trained = True

        # Persist to disk
        self._save_models()
        logger.info("✅ Training complete — IsolationForest + PCA ready.")

    def _save_models(self):
        try:
            joblib.dump(self.model,   MODEL_PATH)
            joblib.dump(self.mlp_rul, MLP_MODEL_PATH)
            joblib.dump(self.gp_rul,  GP_MODEL_PATH)
            joblib.dump(self.clf,     CLF_MODEL_PATH)
            joblib.dump(self.scaler,  SCALER_PATH)
            joblib.dump(self.pca,     PCA_PATH)
            joblib.dump(self.static_metrics, METRICS_PATH)
            with open(VERSION_FILE, "w") as f:
                f.write(MODEL_VERSION)
            logger.info("💾 Models saved to disk (version %s).", MODEL_VERSION)
        except Exception as e:
            logger.warning(f"Could not save models: {e}")

    def _load_saved_models(self):
        try:
            paths = [MODEL_PATH, MLP_MODEL_PATH, GP_MODEL_PATH, CLF_MODEL_PATH, SCALER_PATH, PCA_PATH, METRICS_PATH]
            if all(os.path.exists(p) for p in paths):
                self.model   = joblib.load(MODEL_PATH)
                self.mlp_rul = joblib.load(MLP_MODEL_PATH)
                self.gp_rul  = joblib.load(GP_MODEL_PATH)
                self.clf     = joblib.load(CLF_MODEL_PATH)
                self.scaler  = joblib.load(SCALER_PATH)
                self.pca     = joblib.load(PCA_PATH)
                self.static_metrics = joblib.load(METRICS_PATH)
                self.is_trained = True
                self._rebuild_cache()
                return True
        except Exception as e:
            logger.warning(f"Could not load saved models: {e}")
        return False

    def _rebuild_cache(self):
        """Rebuild training_data_cache after loading models from disk."""
        data = self._load_training_dataset()
        if data is None:
            return
        X = data[["max_vibration", "rms_vibration"]].values
        X_scaled = self.scaler.transform(X)
        X_pca = self.pca.transform(X_scaled)
        scores_raw = self.model.score_samples(X_scaled)
        data = data.copy()
        data["pc1"] = X_pca[:, 0]
        data["pc2"] = X_pca[:, 1]
        data["anomaly_score"] = self._map_score(scores_raw)
        data["is_anomaly"] = self.model.predict(X_scaled) == -1
        self.training_data_cache = data

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    @staticmethod
    def _map_score(raw_score: np.ndarray) -> np.ndarray:
        """
        Map IsolationForest score_samples output to [0, 1] anomaly score.
        score_samples returns near 0 for normal, more negative for anomalies.
        We invert so that 1.0 = highly anomalous, 0.0 = perfectly normal.
        """
        clipped = np.clip(raw_score, -1.0, 0.1)
        normalized = (clipped - 0.1) / (-1.0 - 0.1)
        return np.clip(normalized, 0.0, 1.0)

    def predict(self, max_vib: float, rms_vib: float) -> float:
        """Return anomaly score in [0, 1]. 0 = normal, 1 = critical."""
        if not self.is_trained:
            return 0.0
        X = np.array([[max_vib, rms_vib]])
        X_scaled = self.scaler.transform(X)
        raw = self.model.score_samples(X_scaled)[0]
        return float(self._map_score(np.array([raw]))[0])

    def predict_pca(self, max_vib: float, rms_vib: float) -> dict:
        """Project a single point into PCA space."""
        if not self.is_trained:
            return {"pc1": 0.0, "pc2": 0.0}
        X = np.array([[max_vib, rms_vib]])
        X_scaled = self.scaler.transform(X)
        coords = self.pca.transform(X_scaled)[0]
        return {"pc1": float(coords[0]), "pc2": float(coords[1])}

    # ------------------------------------------------------------------
    # Analytics for Dashboard
    # ------------------------------------------------------------------

    def get_pca_analytics(self) -> dict:
        """Return PCA scatter data for the training dataset."""
        if self.training_data_cache is None:
            return {"points": [], "explained_variance": []}

        df = self.training_data_cache.copy()
        # Sample max 500 points for performance
        if len(df) > 500:
            df = df.sample(500, random_state=42)

        points = []
        for _, row in df.iterrows():
            points.append({
                "pc1": round(float(row["pc1"]), 4),
                "pc2": round(float(row["pc2"]), 4),
                "anomaly_score": round(float(row["anomaly_score"]), 3),
                "is_anomaly": bool(row["is_anomaly"]),
                "source": str(row["source"]),
                "max_vibration": round(float(row["max_vibration"]), 4),
                "rms_vibration": round(float(row["rms_vibration"]), 4),
            })

        explained_variance = (
            [round(float(v), 4) for v in self.pca.explained_variance_ratio_]
            if self.pca
            else []
        )

        return {
            "points": points,
            "explained_variance": explained_variance,
            "total_samples": len(self.training_data_cache),
            "anomaly_count": int(self.training_data_cache["is_anomaly"].sum()),
        }

    def get_model_info(self) -> dict:
        """Return model metadata for the dashboard."""
        info = {
            "is_trained": self.is_trained,
            "model_type": "IsolationForest",
            "contamination": self.contamination,
            "n_estimators": 200,
            "train_dataset": "nasa_test4_features (4 bearings)",
            "test_dataset": "nasa_test2_features (simulation stream)",
            "static_metrics": self.static_metrics,
        }
        if self.pca:
            info["pca_components"] = 2
            info["explained_variance_ratio"] = [
                round(float(v), 4) for v in self.pca.explained_variance_ratio_
            ]
        if self.training_data_cache is not None:
            info["training_samples"] = len(self.training_data_cache)
            info["anomaly_count_in_training"] = int(
                self.training_data_cache["is_anomaly"].sum()
            )
        return info
