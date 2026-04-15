import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { useStore } from '../store/useStore';

const StatusBadge = ({ isConnected }) => (
  <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border ${isConnected ? 'border-brutal-green text-brutal-green bg-brutal-green/10' : 'border-brutal-critical text-brutal-critical bg-brutal-critical/10'}`}>
    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-brutal-green animate-pulse' : 'bg-brutal-critical'}`} />
    {isConnected ? 'LIVE (WS)' : 'DISCONNECTED'}
  </div>
);

const MetricCard = ({ title, value, unit, isAlert }) => (
  <div className={`p-4 rounded-xl border ${isAlert ? 'border-brutal-critical bg-brutal-critical/5' : 'border-brutal-border bg-brutal-panel'}`}>
    <h3 className="text-brutal-muted text-sm font-semibold uppercase tracking-wider mb-2">{title}</h3>
    <div className="flex items-baseline gap-1">
      <span className={`text-3xl font-mono font-bold ${isAlert ? 'text-brutal-critical' : 'text-brutal-text'}`}>
        {value}
      </span>
      {unit && <span className="text-brutal-muted text-sm font-mono">{unit}</span>}
    </div>
  </div>
);

export const Dashboard = () => {
  const { currentScore, currentMax, currentRms, alertStatus, connectionStatus, telemetryData } = useStore();

  const isConnected = connectionStatus === 'connected';
  const isCritical = alertStatus === 'CRITICAL';
  
  const chartData = telemetryData.map((d, index) => ({
    time: index,
    rms: parseFloat(d.rms_vibration.toFixed(4)),
    score: parseFloat(d.anomaly_score.toFixed(4))
  }));

  const mapAlertColor = () => {
    switch (alertStatus) {
      case 'CRITICAL': return 'bg-brutal-critical text-white';
      case 'WARNING': return 'bg-brutal-warning text-black';
      case 'HEALTHY': default: return 'bg-brutal-green text-black';
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto flex flex-col gap-6">
      
      {/* Header */}
      <header className="flex justify-between items-center bg-brutal-panel border border-brutal-border p-4 rounded-xl shadow-lg">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Aegis Command Center</h1>
          <p className="text-sm text-brutal-muted font-mono mt-1">INDUSTRIAL TELEMETRY NODE α-1</p>
        </div>
        <StatusBadge isConnected={isConnected} />
      </header>

      {/* Main Alert Box */}
      <div className={`p-6 rounded-xl shadow-lg transition-colors duration-500 flex flex-col items-center justify-center min-h-[160px] ${mapAlertColor()}`}>
        <h2 className="text-lg opacity-80 uppercase tracking-widest font-semibold mb-2">System Status</h2>
        <div className="text-5xl md:text-7xl font-bold font-mono tracking-tighter drop-shadow-md">
          {alertStatus}
        </div>
      </div>

      {/* Primary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <MetricCard title="Anomaly Score" value={currentScore.toFixed(3)} isAlert={isCritical} />
         <MetricCard title="Peak Vibration" value={currentMax.toFixed(3)} unit="g" />
         <MetricCard title="RMS Vibration" value={currentRms.toFixed(3)} unit="g" />
      </div>

      {/* Telemetry Chart */}
      <div className="bg-brutal-panel border border-brutal-border rounded-xl p-4 shadow-lg min-h-[300px] flex-1">
        <h3 className="text-brutal-muted text-sm font-semibold uppercase tracking-wider mb-6">Real-Time RMS Telemetry</h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
              <XAxis dataKey="time" hide />
              <YAxis stroke="#888" tickFormatter={(v) => v.toFixed(2)} width={50} domain={['auto', 'auto']} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1A1A1D', border: '1px solid #333', borderRadius: '8px' }}
                labelStyle={{ display: 'none' }}
              />
              <Line 
                type="monotone" 
                dataKey="rms" 
                stroke={isCritical ? '#ef4444' : '#22c55e'} 
                strokeWidth={3}
                dot={false}
                isAnimationActive={false} // Disable animation for live streaming
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
};
