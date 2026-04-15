import { create } from 'zustand';

export const useStore = create((set) => ({
  telemetryData: [],
  currentScore: 0,
  currentMax: 0,
  currentRms: 0,
  alertStatus: 'HEALTHY',
  connectionStatus: 'disconnected',

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  
  addTelemetry: (data) => set((state) => {
    // Keep last 100 data points for the rolling chart window buffer
    const newHistory = [...state.telemetryData, data];
    if (newHistory.length > 100) {
      newHistory.shift();
    }
    return {
      telemetryData: newHistory,
      currentScore: data.anomaly_score,
      currentMax: data.max_vibration,
      currentRms: data.rms_vibration,
      alertStatus: data.alert_status
    };
  })
}));
