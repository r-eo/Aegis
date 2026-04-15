import { create } from 'zustand';

export const useStore = create((set) => ({
  // ── Live telemetry ──────────────────────────────────────
  telemetryData:    [],
  currentScore:     0,
  currentMax:       0,
  currentRms:       0,
  currentMape:      0,
  mapeHistory:      [],
  alertStatus:      'IDLE',
  connectionStatus: 'disconnected',
  simulatorRunning: false,
  rowProgress:      { index: 0, total: 985 },

  // ── PCA live point ──────────────────────────────────────
  currentPca: { pc1: 0, pc2: 0 },

  // ── Analytics (REST) ────────────────────────────────────
  pcaAnalytics: null,
  datasetStats: null,
  modelInfo: null,

  // ── Actions ─────────────────────────────────────────────
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setSimulatorRunning: (val)    => set({ simulatorRunning: val }),

  addTelemetry: (data) => set((state) => {
    if (data.status === 'buffering') return {};
    if (data.type === 'status') return { simulatorRunning: data.simulator_running };

    const newHistory = [...state.telemetryData, data];
    if (newHistory.length > 120) newHistory.shift();

    const mapeHist = [...state.mapeHistory, { v: data.streaming_mape ?? 0 }];
    if (mapeHist.length > 120) mapeHist.shift();

    return {
      telemetryData:    newHistory,
      currentScore:     data.anomaly_score     ?? state.currentScore,
      currentMax:       data.max_vibration     ?? state.currentMax,
      currentRms:       data.rms_vibration     ?? state.currentRms,
      currentMape:      data.streaming_mape    ?? state.currentMape,
      mapeHistory:      mapeHist,
      alertStatus:      data.alert_status      ?? state.alertStatus,
      currentPca:       data.pca               ?? state.currentPca,
      rowProgress:      { index: data.row_index ?? 0, total: data.total_rows ?? 985 },
    };
  }),

  setPcaAnalytics: (d) => set({ pcaAnalytics: d }),
  setDatasetStats: (d) => set({ datasetStats: d }),
  setModelInfo:    (d) => set({ modelInfo: d }),
}));
