import React, { useEffect, useCallback, useRef, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, ScatterChart, Scatter, ZAxis, ReferenceLine,
  AreaChart, Area, Legend
} from 'recharts';
import { useStore } from '../store/useStore';
import { useAccelerometer } from '../hooks/useAccelerometer';

// ─── env ───────────────────────────────────────────────────────────────────
const WS_URL    = import.meta.env.VITE_WS_URL    || 'ws://localhost:8000/ws/telemetry';
const API_BASE  = import.meta.env.VITE_API_BASE  || 'http://localhost:8000';

// ─── helpers ───────────────────────────────────────────────────────────────
const alertColors = {
  CRITICAL: { bg: 'bg-red-600',  text: 'text-white',  border: 'border-red-500',  hex: '#ef4444' },
  WARNING:  { bg: 'bg-yellow-500', text: 'text-black', border: 'border-yellow-400', hex: '#eab308' },
  HEALTHY:  { bg: 'bg-emerald-500', text: 'text-black', border: 'border-emerald-400', hex: '#22c55e' },
};

// ─── Sub-components ─────────────────────────────────────────────────────────

const ConnectionPill = ({ status }) => {
  const colors = {
    connected:    'border-emerald-500 text-emerald-400 bg-emerald-500/10',
    connecting:   'border-yellow-400 text-yellow-300 bg-yellow-400/10',
    disconnected: 'border-red-500 text-red-400 bg-red-500/10',
  };
  const dot = {
    connected:    'bg-emerald-400 animate-pulse',
    connecting:   'bg-yellow-300 animate-pulse',
    disconnected: 'bg-red-400',
  };
  const label = { connected: 'LIVE', connecting: 'CONNECTING…', disconnected: 'OFFLINE' };
  const cls = colors[status] || colors.disconnected;
  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border ${cls}`}>
      <div className={`w-2 h-2 rounded-full ${dot[status] || dot.disconnected}`} />
      {label[status] || 'OFFLINE'}
    </div>
  );
};

const MetricCard = ({ title, value, unit, sub, accent }) => (
  <div className={`p-4 rounded-2xl border bg-brutal-panel flex flex-col gap-1 ${accent || 'border-brutal-border'}`}>
    <p className="text-brutal-muted text-xs font-semibold uppercase tracking-widest">{title}</p>
    <div className="flex items-baseline gap-1 mt-1">
      <span className="text-3xl font-mono font-bold text-brutal-text">{value}</span>
      {unit && <span className="text-brutal-muted text-sm font-mono">{unit}</span>}
    </div>
    {sub && <p className="text-brutal-muted text-xs mt-1">{sub}</p>}
  </div>
);

const SectionHeader = ({ children }) => (
  <h2 className="text-brutal-muted text-xs font-semibold uppercase tracking-widest mb-3">{children}</h2>
);

// Custom PCA tooltip
const PcaTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-[#1A1A1D] border border-brutal-border rounded-lg p-3 text-xs font-mono min-w-[160px]">
      <p className="text-brutal-muted mb-1">{d.source?.toUpperCase()}</p>
      <p>PC1: <span className="text-brutal-text">{d.pc1?.toFixed(3)}</span></p>
      <p>PC2: <span className="text-brutal-text">{d.pc2?.toFixed(3)}</span></p>
      <p>Score: <span className={d.is_anomaly ? 'text-red-400' : 'text-emerald-400'}>{d.anomaly_score?.toFixed(3)}</span></p>
    </div>
  );
};

// ─── Main Dashboard ─────────────────────────────────────────────────────────

export const Dashboard = () => {
  const {
    currentScore, currentMax, currentRms, alertStatus,
    connectionStatus, telemetryData, currentPca,
    pcaAnalytics, datasetStats, modelInfo,
    setConnectionStatus, addTelemetry,
    setPcaAnalytics, setDatasetStats, setModelInfo,
  } = useStore();

  // ── Receive-only WebSocket (dashboard viewer) ──────────────────────────
  const wsRef = useRef(null);
  useEffect(() => {
    let retryTimer = null;
    const connect = () => {
      setConnectionStatus('connecting');
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen  = () => setConnectionStatus('connected');
      ws.onmessage = (e) => { try { addTelemetry(JSON.parse(e.data)); } catch {} };
      ws.onclose = () => {
        setConnectionStatus('disconnected');
        retryTimer = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { clearTimeout(retryTimer); wsRef.current?.close(); };
  }, [addTelemetry, setConnectionStatus]);

  // ── Accelerometer sender hook ──────────────────────────────────────────
  const { permission, isStreaming, requestPermission, stopStreaming } =
    useAccelerometer(WS_URL);

  // ── Fetch analytics from REST API (once on mount) ──────────────────────
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const [pcaRes, statsRes, modelRes] = await Promise.all([
          fetch(`${API_BASE}/api/pca-analytics`),
          fetch(`${API_BASE}/api/dataset-stats`),
          fetch(`${API_BASE}/api/model-info`),
        ]);
        if (pcaRes.ok) setPcaAnalytics(await pcaRes.json());
        if (statsRes.ok) setDatasetStats(await statsRes.json());
        if (modelRes.ok) setModelInfo(await modelRes.json());
      } catch (e) {
        console.warn('[Aegis] Could not fetch analytics:', e);
      }
    };
    fetchAnalytics();
  }, [setPcaAnalytics, setDatasetStats, setModelInfo]);

  // ── Derived chart data ─────────────────────────────────────────────────
  const chartData = telemetryData.map((d, i) => ({
    i,
    rms:   parseFloat((d.rms_vibration ?? 0).toFixed(4)),
    score: parseFloat((d.anomaly_score  ?? 0).toFixed(4)),
    max:   parseFloat((d.max_vibration  ?? 0).toFixed(4)),
  }));

  // Split PCA points by source for different colors
  const cwruNormal   = (pcaAnalytics?.points || []).filter(p => p.source === 'cwru' && !p.is_anomaly);
  const cwruAnom     = (pcaAnalytics?.points || []).filter(p => p.source === 'cwru' &&  p.is_anomaly);
  const nasaNormal   = (pcaAnalytics?.points || []).filter(p => p.source === 'nasa' && !p.is_anomaly);
  const nasaAnom     = (pcaAnalytics?.points || []).filter(p => p.source === 'nasa' &&  p.is_anomaly);
  const livePoint    = currentPca.pc1 !== 0 || currentPca.pc2 !== 0
    ? [{ pc1: currentPca.pc1, pc2: currentPca.pc2, anomaly_score: currentScore, is_anomaly: currentScore > 0.4 }]
    : [];

  const alert = alertColors[alertStatus] || alertColors.HEALTHY;
  const isCritical = alertStatus === 'CRITICAL';
  const isWarning  = alertStatus === 'WARNING';

  return (
    <div className="min-h-screen bg-brutal-dark text-brutal-text p-4 md:p-6 max-w-7xl mx-auto flex flex-col gap-5">

      {/* ── Header ── */}
      <header className="flex flex-wrap justify-between items-center gap-3 bg-brutal-panel border border-brutal-border p-4 rounded-2xl shadow-lg">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">⚡ Aegis Command Center</h1>
          <p className="text-brutal-muted text-xs font-mono mt-0.5">PREDICTIVE MAINTENANCE · ISOLATION FOREST v1.0</p>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionPill status={connectionStatus} />
          {modelInfo?.is_trained && (
            <span className="text-xs font-mono text-emerald-400 border border-emerald-600 rounded-full px-3 py-1 bg-emerald-500/10">
              MODEL READY · {modelInfo.training_samples?.toLocaleString()} pts
            </span>
          )}
        </div>
      </header>

      {/* ── Alert Banner ── */}
      <div className={`rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 p-5 shadow-xl transition-all duration-700 ${alert.bg} ${alert.text}`}>
        <div>
          <p className="text-sm opacity-70 uppercase tracking-widest font-semibold">System Status</p>
          <div className={`text-5xl md:text-6xl font-bold font-mono tracking-tighter mt-1 ${isCritical ? 'animate-pulse' : ''}`}>
            {alertStatus}
          </div>
        </div>
        <div className="flex flex-col items-center sm:items-end gap-1">
          <div className="text-4xl font-mono font-black">{(currentScore * 100).toFixed(1)}<span className="text-2xl opacity-60">%</span></div>
          <p className="text-sm opacity-70 font-mono">ANOMALY SCORE</p>
        </div>
      </div>

      {/* ── Accelerometer Sender Button ── */}
      <div className="bg-brutal-panel border border-brutal-border rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">📱 Phone Accelerometer</p>
          <p className="text-brutal-muted text-xs mt-0.5 font-mono">
            {permission === 'unavailable'
              ? 'DeviceMotionEvent not available in this browser.'
              : permission === 'denied'
              ? '⚠ Permission denied. Check browser settings.'
              : isStreaming
              ? '✅ Streaming accelerometer data at 20 Hz…'
              : 'Open this page on your phone to stream live sensor data.'}
          </p>
        </div>
        {!isStreaming ? (
          <button
            id="btn-start-accelerometer"
            onClick={requestPermission}
            disabled={permission === 'unavailable' || permission === 'denied'}
            className="px-5 py-2 rounded-xl font-semibold text-sm bg-emerald-500 text-black hover:bg-emerald-400 transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Start Monitoring
          </button>
        ) : (
          <button
            id="btn-stop-accelerometer"
            onClick={stopStreaming}
            className="px-5 py-2 rounded-xl font-semibold text-sm bg-red-500 text-white hover:bg-red-400 transition whitespace-nowrap"
          >
            Stop Streaming
          </button>
        )}
      </div>

      {/* ── Primary Metrics ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          title="Anomaly Score"
          value={(currentScore).toFixed(3)}
          accent={isCritical ? 'border-red-500' : isWarning ? 'border-yellow-500' : 'border-brutal-border'}
        />
        <MetricCard title="Peak Vibration" value={currentMax.toFixed(4)} unit="g" />
        <MetricCard title="RMS Vibration"  value={currentRms.toFixed(4)} unit="g" />
        <MetricCard
          title="Live PCA"
          value={`${currentPca.pc1.toFixed(2)}, ${currentPca.pc2.toFixed(2)}`}
          sub="PC1, PC2"
        />
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* RMS + Max vibration chart */}
        <div className="bg-brutal-panel border border-brutal-border rounded-2xl p-4 shadow-lg">
          <SectionHeader>Real-Time Vibration (g)</SectionHeader>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="rmsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={alert.hex} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={alert.hex} stopOpacity={0}   />
                  </linearGradient>
                  <linearGradient id="maxGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#818cf8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                <XAxis dataKey="i" hide />
                <YAxis stroke="#555" tick={{ fontSize: 10 }} width={42} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: '#1A1A1D', border: '1px solid #333', borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ display: 'none' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="rms" name="RMS" stroke={alert.hex}  fill="url(#rmsGrad)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="max" name="MAX" stroke="#818cf8" fill="url(#maxGrad)" strokeWidth={2} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Anomaly Score chart */}
        <div className="bg-brutal-panel border border-brutal-border rounded-2xl p-4 shadow-lg">
          <SectionHeader>Anomaly Score (0 → 1)</SectionHeader>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#f97316" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                <XAxis dataKey="i" hide />
                <YAxis stroke="#555" tick={{ fontSize: 10 }} width={42} domain={[0, 1]} />
                <Tooltip
                  contentStyle={{ background: '#1A1A1D', border: '1px solid #333', borderRadius: 8, fontSize: 11 }}
                  labelStyle={{ display: 'none' }}
                />
                <ReferenceLine y={0.7} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'CRITICAL', fill: '#ef4444', fontSize: 10 }} />
                <ReferenceLine y={0.4} stroke="#eab308" strokeDasharray="4 4" label={{ value: 'WARNING',  fill: '#eab308', fontSize: 10 }} />
                <Area type="monotone" dataKey="score" name="Score" stroke="#f97316" fill="url(#scoreGrad)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── PCA Scatter Plot ── */}
      <div className="bg-brutal-panel border border-brutal-border rounded-2xl p-4 shadow-lg">
        <div className="flex justify-between items-start mb-1">
          <SectionHeader>PCA — Training Data Projection</SectionHeader>
          {pcaAnalytics && (
            <span className="text-xs font-mono text-brutal-muted">
              Var explained: PC1 {((pcaAnalytics.explained_variance?.[0] ?? 0) * 100).toFixed(1)}% · PC2 {((pcaAnalytics.explained_variance?.[1] ?? 0) * 100).toFixed(1)}%
            </span>
          )}
        </div>
        <div className="h-72">
          {pcaAnalytics ? (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 10, left: -10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis type="number" dataKey="pc1" name="PC1" stroke="#555" tick={{ fontSize: 9 }} label={{ value: 'PC1', position: 'insideBottomRight', offset: -5, fill: '#666', fontSize: 10 }} domain={['auto', 'auto']} />
                <YAxis type="number" dataKey="pc2" name="PC2" stroke="#555" tick={{ fontSize: 9 }} label={{ value: 'PC2', angle: -90, position: 'insideLeft', fill: '#666', fontSize: 10 }} domain={['auto', 'auto']} />
                <ZAxis range={[20, 20]} />
                <Tooltip content={<PcaTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Scatter name="CWRU Normal"   data={cwruNormal} fill="#22c55e"  opacity={0.5} />
                <Scatter name="CWRU Anomaly"  data={cwruAnom}   fill="#ef4444"  opacity={0.8} />
                <Scatter name="NASA Normal"   data={nasaNormal} fill="#818cf8"  opacity={0.5} />
                <Scatter name="NASA Anomaly"  data={nasaAnom}   fill="#f97316"  opacity={0.9} />
                {livePoint.length > 0 && (
                  <Scatter name="⚡ LIVE"     data={livePoint}  fill="#ffffff"  shape="star" />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-brutal-muted text-sm font-mono">
              {connectionStatus === 'connected' ? 'Loading PCA data from backend…' : 'Connect to backend to load PCA analytics.'}
            </div>
          )}
        </div>
      </div>

      {/* ── Dataset Stats ── */}
      {datasetStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            title="Training Samples"
            value={datasetStats.total_samples?.toLocaleString()}
            sub="CWRU + NASA"
          />
          <MetricCard
            title="Anomalies Found"
            value={datasetStats.anomaly_count?.toLocaleString()}
            sub={`${((datasetStats.anomaly_rate ?? 0) * 100).toFixed(1)}% rate`}
            accent="border-orange-600"
          />
          <MetricCard
            title="Max Vib Range"
            value={`${datasetStats.max_vibration?.min?.toFixed(2)} – ${datasetStats.max_vibration?.max?.toFixed(2)}`}
            unit="g"
          />
          <MetricCard
            title="RMS Vib Mean"
            value={datasetStats.rms_vibration?.mean?.toFixed(4)}
            unit="g"
            sub={`±${datasetStats.rms_vibration?.std?.toFixed(4)} std`}
          />
        </div>
      )}

      {/* ── Model Info Footer ── */}
      {modelInfo && (
        <div className="bg-brutal-panel border border-brutal-border rounded-2xl p-4 text-xs font-mono text-brutal-muted flex flex-wrap gap-x-6 gap-y-2">
          <span>MODEL: <span className="text-brutal-text">{modelInfo.model_type}</span></span>
          <span>ESTIMATORS: <span className="text-brutal-text">{modelInfo.n_estimators}</span></span>
          <span>CONTAMINATION: <span className="text-brutal-text">{modelInfo.contamination}</span></span>
          <span>PCA COMPONENTS: <span className="text-brutal-text">{modelInfo.pca_components}</span></span>
          <span>TRAINING SIZE: <span className="text-brutal-text">{modelInfo.training_samples?.toLocaleString()}</span></span>
          <span>VAR EXPLAINED: <span className="text-brutal-text">
            {modelInfo.explained_variance_ratio?.map(v => `${(v * 100).toFixed(1)}%`).join(' + ')}
          </span></span>
        </div>
      )}

    </div>
  );
};
