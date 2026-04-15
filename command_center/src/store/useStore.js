import { create } from 'zustand';

export const useStore = create((set) => ({
  // ── Live telemetry ──────────────────────────────────────
  telemetryData: [],          // rolling window of last 100 points
  currentScore: 0,
  currentMax: 0,
  currentRms: 0,
  alertStatus: 'HEALTHY',
  connectionStatus: 'disconnected',

  // ── PCA live point ──────────────────────────────────────
  currentPca: { pc1: 0, pc2: 0 },

  // ── Analytics (loaded from REST) ────────────────────────
  pcaAnalytics: null,         // { points, explained_variance, total_samples, anomaly_count }
  datasetStats: null,
  modelInfo: null,

  // ── Actions ─────────────────────────────────────────────
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  addTelemetry: (data) => set((state) => {
    // Ignore buffering messages
    if (data.status === 'buffering') return {};

    const newHistory = [...state.telemetryData, data];
    if (newHistory.length > 100) newHistory.shift();

    return {
      telemetryData: newHistory,
      currentScore: data.anomaly_score ?? state.currentScore,
      currentMax: data.max_vibration ?? state.currentMax,
      currentRms: data.rms_vibration ?? state.currentRms,
      alertStatus: data.alert_status ?? state.alertStatus,
      currentPca: data.pca ?? state.currentPca,
    };
  }),

  setPcaAnalytics: (data) => set({ pcaAnalytics: data }),
  setDatasetStats: (data) => set({ datasetStats: data }),
  setModelInfo: (data) => set({ modelInfo: data }),
}));
