import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, ScatterChart, Scatter, ZAxis, ReferenceLine, Legend, LineChart, Line,
} from 'recharts';
import { useStore } from '../store/useStore';

const WS_URL   = import.meta.env.VITE_WS_URL   || 'ws://localhost:8000/ws/telemetry';
const API_BASE = import.meta.env.VITE_API_BASE  || 'http://localhost:8000';

// ─── colour system ───────────────────────────────────────────────────────────
const C = {
  brand:    '#6366f1',   // indigo
  brandGlo: '#6366f133',
  cyan:     '#22d3ee',
  cyanGlo:  '#22d3ee22',
  green:    '#10b981',
  greenGlo: '#10b98122',
  amber:    '#f59e0b',
  amberGlo: '#f59e0b22',
  red:      '#ef4444',
  redGlo:   '#ef444422',
  muted:    '#94a3b8',
  panel:    '#0f172a',
  card:     '#1e293b',
  border:   '#334155',
  text:     '#f1f5f9',
};

const alertPalette = {
  IDLE:     { hex: C.muted,  bg: 'from-slate-800 to-slate-900', text: 'text-slate-300', label: 'IDLE' },
  HEALTHY:  { hex: C.green,  bg: 'from-emerald-900/60 to-slate-900', text: 'text-emerald-300', label: 'HEALTHY' },
  WARNING:  { hex: C.amber,  bg: 'from-amber-900/60 to-slate-900',   text: 'text-amber-300',   label: 'WARNING'  },
  CRITICAL: { hex: C.red,    bg: 'from-red-900/70 to-slate-900',     text: 'text-red-300',     label: 'CRITICAL' },
};

// ─── tiny sub-components ─────────────────────────────────────────────────────
const Dot = ({ on, color = '#10b981' }) => (
  <span className="relative flex h-2.5 w-2.5">
    {on && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: color }} />}
    <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: on ? color : '#475569' }} />
  </span>
);

const Badge = ({ children, color = C.brand }) => (
  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase border"
        style={{ color, borderColor: color + '55', background: color + '15' }}>
    {children}
  </span>
);

const KpiCard = ({ label, value, unit, sub, accent, icon, glow }) => (
  <div className="relative rounded-2xl p-4 overflow-hidden border"
       style={{ background: C.card, borderColor: accent || C.border, boxShadow: glow ? `0 0 24px ${glow}44` : undefined }}>
    <div className="text-[10px] font-bold tracking-widest uppercase flex items-center gap-2" style={{ color: C.muted }}>
      {icon && <span>{icon}</span>}{label}
    </div>
    <div className="mt-2 flex items-baseline gap-1.5">
      <span className="text-3xl font-mono font-black" style={{ color: C.text }}>{value}</span>
      {unit && <span className="text-xs font-mono" style={{ color: C.muted }}>{unit}</span>}
    </div>
    {sub && <div className="mt-1 text-[11px] font-mono" style={{ color: C.muted }}>{sub}</div>}
    {glow && <div className="absolute inset-0 pointer-events-none rounded-2xl"
                  style={{ background: `radial-gradient(circle at 0% 100%, ${glow}18, transparent 60%)` }} />}
  </div>
);

const SectionTitle = ({ children, right }) => (
  <div className="flex items-center justify-between mb-3">
    <h2 className="text-[11px] font-bold tracking-widest uppercase" style={{ color: C.muted }}>{children}</h2>
    {right}
  </div>
);

const ChartCard = ({ title, right, h = 'h-52', children }) => (
  <div className="rounded-2xl p-4 border" style={{ background: C.card, borderColor: C.border }}>
    <SectionTitle right={right}>{title}</SectionTitle>
    <div className={h}>{children}</div>
  </div>
);

const tooltipStyle = {
  contentStyle: { background: '#0f172a', border: '1px solid #334155', borderRadius: 10, fontSize: 11, fontFamily: 'monospace' },
  labelStyle:   { display: 'none' },
};

// ─── Progress bar ─────────────────────────────────────────────────────────────
const StreamProgress = ({ index, total }) => {
  const pct = total > 0 ? ((index / total) * 100).toFixed(1) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-mono" style={{ color: C.muted }}>
        <span>DATA PROGRESS · nasa_test2</span>
        <span>{index} / {total} ({pct}%)</span>
      </div>
      <div className="w-full rounded-full h-1.5" style={{ background: '#1e293b' }}>
        <div className="h-1.5 rounded-full transition-all duration-500"
             style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${C.brand}, ${C.cyan})` }} />
      </div>
    </div>
  );
};

// ─── MAPE gauge ───────────────────────────────────────────────────────────────
const MapeGauge = ({ value }) => {
  const clamped = Math.min(value, 50);
  const pct     = (clamped / 50) * 100;
  const color   = value < 5 ? C.green : value < 15 ? C.amber : C.red;
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#1e293b"  strokeWidth="10" />
          <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="10"
                  strokeDasharray={`${2 * Math.PI * 40 * pct / 100} 999`}
                  className="transition-all duration-700" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
          <span className="text-xl font-black font-mono" style={{ color }}>{value.toFixed(1)}</span>
          <span className="text-[9px] font-bold tracking-widest" style={{ color: C.muted }}>MAPE %</span>
        </div>
      </div>
      <div className="text-[10px] font-mono text-center" style={{ color: C.muted }}>
        {value < 5 ? '✓ Low deviation' : value < 15 ? '⚠ Moderate variance' : '✕ High anomaly variance'}
      </div>
    </div>
  );
};

// ─── Main Dashboard ──────────────────────────────────────────────────────────
export const Dashboard = () => {
  const {
    currentScore, currentMax, currentRms, currentMape, mapeHistory,
    alertStatus, connectionStatus, telemetryData, currentPca, rowProgress,
    pcaAnalytics, datasetStats, modelInfo,
    setConnectionStatus, addTelemetry, simulatorRunning, setSimulatorRunning,
    setPcaAnalytics, setDatasetStats, setModelInfo,
  } = useStore();

  const wsRef    = useRef(null);
  const [simBusy, setSimBusy] = useState(false);

  // ── WebSocket ──────────────────────────────────────────────
  useEffect(() => {
    let retryTimer = null;
    const connect = () => {
      setConnectionStatus('connecting');
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen    = () => setConnectionStatus('connected');
      ws.onmessage = (e) => { try { addTelemetry(JSON.parse(e.data)); } catch {} };
      ws.onclose   = () => { setConnectionStatus('disconnected'); retryTimer = setTimeout(connect, 3000); };
      ws.onerror   = () => ws.close();
    };
    connect();
    return () => { clearTimeout(retryTimer); wsRef.current?.close(); };
  }, [addTelemetry, setConnectionStatus]);

  // ── Boot: fetch analytics + check simulator status ─────────────────────────
  useEffect(() => {
    const boot = async () => {
      try {
        const [pcaR, statR, modR, simR] = await Promise.all([
          fetch(`${API_BASE}/api/pca-analytics`),
          fetch(`${API_BASE}/api/dataset-stats`),
          fetch(`${API_BASE}/api/model-info`),
          fetch(`${API_BASE}/api/simulator/status`),
        ]);
        if (pcaR.ok)  setPcaAnalytics(await pcaR.json());
        if (statR.ok) setDatasetStats(await statR.json());
        if (modR.ok)  setModelInfo(await modR.json());
        if (simR.ok) {
          const s = await simR.json();
          setSimulatorRunning(s.running);
        }
      } catch (e) { console.warn('[Aegis] boot fetch failed', e); }
    };
    boot();
  }, [setPcaAnalytics, setDatasetStats, setModelInfo, setSimulatorRunning]);

  // ── Start / Stop simulator ─────────────────────────────────
  const toggleSimulator = useCallback(async () => {
    setSimBusy(true);
    try {
      const action = simulatorRunning ? 'stop' : 'start';
      const res = await fetch(`${API_BASE}/api/simulator/${action}`, { method: 'POST' });
      if (res.ok) setSimulatorRunning(!simulatorRunning);
    } catch (e) { console.error('[Aegis] simulator toggle failed', e); }
    setSimBusy(false);
  }, [simulatorRunning, setSimulatorRunning]);

  // ── Derived chart data ─────────────────────────────────────
  const chartData = telemetryData.map((d, i) => ({
    i,
    rms:   +(d.rms_vibration  ?? 0).toFixed(4),
    max:   +(d.max_vibration  ?? 0).toFixed(4),
    score: +(d.anomaly_score  ?? 0).toFixed(4),
  }));

  const palette     = alertPalette[alertStatus] || alertPalette.HEALTHY;
  const isCritical  = alertStatus === 'CRITICAL';
  const isStreaming  = simulatorRunning;

  // PCA scatter grouping  (nasa_t4_bX sources)
  const pcaPoints  = pcaAnalytics?.points || [];
  const nasaNormal = pcaPoints.filter(p => !p.is_anomaly);
  const nasaAnom   = pcaPoints.filter(p =>  p.is_anomaly);
  const livePoint  = (currentPca.pc1 !== 0 || currentPca.pc2 !== 0)
    ? [{ pc1: currentPca.pc1, pc2: currentPca.pc2, anomaly_score: currentScore, is_anomaly: currentScore > 0.4 }]
    : [];

  // connection dot color
  const connColor = connectionStatus === 'connected' ? C.green : connectionStatus === 'connecting' ? C.amber : C.red;

  return (
    <div className="min-h-screen text-slate-100 p-4 md:p-6 space-y-4 max-w-screen-2xl mx-auto"
         style={{ background: 'linear-gradient(135deg, #020617 0%, #0f172a 100%)', fontFamily: "'Inter', sans-serif" }}>

      {/* ── Header ── */}
      <header className="rounded-2xl border px-5 py-3.5 flex flex-wrap items-center justify-between gap-3"
              style={{ background: C.card, borderColor: C.border }}>
        <div className="flex items-center gap-3">
          <div className="text-2xl">⚡</div>
          <div>
            <h1 className="text-lg font-black tracking-tight" style={{ color: C.text }}>
              AEGIS <span style={{ color: C.brand }}>PREDICTIVE CORE</span>
            </h1>
            <p className="text-[10px] font-mono tracking-widest mt-0.5" style={{ color: C.muted }}>
              NASA BEARING DATASET · ISOLATION FOREST v2.0 · STREAMING MAPE ANALYSIS
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Connection pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-mono"
               style={{ borderColor: connColor + '44', color: connColor, background: connColor + '15' }}>
            <Dot on={connectionStatus === 'connected'} color={connColor} />
            {connectionStatus.toUpperCase()}
          </div>

          {modelInfo?.is_trained && (
            <Badge color={C.brand}>
              MODEL READY · {modelInfo.training_samples?.toLocaleString()} pts
            </Badge>
          )}

          {/* Start / Stop streaming */}
          <button
            id="btn-toggle-simulator"
            onClick={toggleSimulator}
            disabled={simBusy}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl font-bold text-sm transition-all duration-300 disabled:opacity-50"
            style={{
              background: isStreaming
                ? `linear-gradient(135deg, #dc2626, #b91c1c)`
                : `linear-gradient(135deg, ${C.brand}, #4f46e5)`,
              color: '#fff',
              boxShadow: isStreaming ? '0 0 20px #ef444455' : `0 0 20px ${C.brand}55`,
            }}>
            {simBusy ? '⏳' : isStreaming ? '⏹ Stop Stream' : '▶ Start Stream'}
          </button>
        </div>
      </header>

      {/* ── Alert Banner ── */}
      <div className={`rounded-2xl bg-gradient-to-r ${palette.bg} border px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all duration-700`}
           style={{ borderColor: palette.hex + '33', boxShadow: `0 0 40px ${palette.hex}22` }}>
        <div>
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: palette.hex }}>System Status</p>
          <div className={`text-6xl font-black font-mono tracking-tighter mt-1 ${palette.text} ${isCritical ? 'animate-pulse' : ''}`}>
            {isStreaming ? alertStatus : 'PAUSED'}
          </div>
          {isStreaming && (
            <p className="text-xs mt-2 font-mono" style={{ color: C.muted }}>
              Streaming nasa_test2_features · {rowProgress.index}/{rowProgress.total} rows processed
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-5xl font-black font-mono" style={{ color: palette.hex }}>
            {(currentScore * 100).toFixed(1)}<span className="text-2xl opacity-50">%</span>
          </div>
          <p className="text-xs font-mono mt-1" style={{ color: C.muted }}>ANOMALY SCORE</p>
        </div>
      </div>

      {/* ── Stream progress bar ── */}
      {isStreaming && (
        <div className="rounded-2xl border px-5 py-3" style={{ background: C.card, borderColor: C.border }}>
          <StreamProgress index={rowProgress.index} total={rowProgress.total} />
        </div>
      )}

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard icon="📊" label="Anomaly Score"   value={(currentScore * 100).toFixed(1)} unit="%"
                 accent={isCritical ? C.red : alertStatus === 'WARNING' ? C.amber : C.border}
                 glow={isCritical ? C.red : alertStatus === 'WARNING' ? C.amber : undefined} />
        <KpiCard icon="📈" label="Peak Vibration"  value={currentMax.toFixed(4)} unit="g" glow={C.brand} />
        <KpiCard icon="〜" label="RMS Vibration"   value={currentRms.toFixed(4)} unit="g" />
        <KpiCard icon="🎯" label="Streaming MAPE"  value={currentMape.toFixed(2)} unit="%"
                 sub={currentMape < 5 ? '✓ Low deviation' : currentMape < 15 ? '⚠ Moderate' : '✕ High variance'}
                 accent={currentMape > 15 ? C.red : currentMape > 5 ? C.amber : C.border}
                 glow={currentMape > 15 ? C.red : undefined} />
        <KpiCard icon="🔵" label="PCA Position"
                 value={`${currentPca.pc1.toFixed(2)}, ${currentPca.pc2.toFixed(2)}`}
                 sub="PC1, PC2 projection" />
      </div>

      {/* ── Charts row 1 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Vibration chart */}
        <ChartCard title="Real-Time Vibration (g) — nasa_test2 Stream">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="gMax" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.brand} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={C.brand} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gRms" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C.cyan} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={C.cyan} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="i" hide />
              <YAxis stroke="#334155" tick={{ fontSize: 9, fill: C.muted }} width={40} domain={['auto', 'auto']} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} />
              <Area type="monotone" dataKey="max" name="MAX"  stroke={C.brand} fill="url(#gMax)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Area type="monotone" dataKey="rms" name="RMS"  stroke={C.cyan}  fill="url(#gRms)" strokeWidth={2} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Anomaly score */}
        <ChartCard title="Anomaly Score Timeline (0 → 1)">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
              <defs>
                <linearGradient id="gScore" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={palette.hex} stopOpacity={0.45} />
                  <stop offset="95%" stopColor={palette.hex} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="i" hide />
              <YAxis stroke="#334155" tick={{ fontSize: 9, fill: C.muted }} width={40} domain={[0, 1]} />
              <Tooltip {...tooltipStyle} />
              <ReferenceLine y={0.7} stroke={C.red}   strokeDasharray="4 4" label={{ value: 'CRITICAL', fill: C.red,   fontSize: 10 }} />
              <ReferenceLine y={0.4} stroke={C.amber} strokeDasharray="4 4" label={{ value: 'WARNING',  fill: C.amber, fontSize: 10 }} />
              <Area type="monotone" dataKey="score" name="Score" stroke={palette.hex} fill="url(#gScore)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── MAPE + PCA row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* MAPE gauge + trend */}
        <div className="rounded-2xl border p-4 space-y-3" style={{ background: C.card, borderColor: C.border }}>
          <SectionTitle>Streaming MAPE Analysis</SectionTitle>
          <MapeGauge value={currentMape} />
          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mapeHistory.map((d, i) => ({ i, v: d.v }))} margin={{ top: 2, right: 5, left: -30, bottom: 0 }}>
                <XAxis dataKey="i" hide />
                <YAxis tick={{ fontSize: 8, fill: C.muted }} />
                <Tooltip {...tooltipStyle} />
                <Line type="monotone" dataKey="v" name="MAPE%" stroke={C.amber} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[10px] font-mono leading-relaxed" style={{ color: C.muted }}>
            <p>MAPE = mean(|xᵢ − x̄| / x̄) × 100</p>
            <p className="mt-0.5">Rolling window: 50 samples · Tracks signal variability in real-time</p>
          </div>
        </div>

        {/* PCA scatter */}
        <div className="lg:col-span-2 rounded-2xl border p-4" style={{ background: C.card, borderColor: C.border }}>
          <SectionTitle right={
            pcaAnalytics && (
              <span className="text-[10px] font-mono" style={{ color: C.muted }}>
                PC1 {((pcaAnalytics.explained_variance?.[0] ?? 0) * 100).toFixed(1)}% ·
                PC2 {((pcaAnalytics.explained_variance?.[1] ?? 0) * 100).toFixed(1)}% var explained
              </span>
            )
          }>
            PCA — Training Data Projection (nasa_test4)
          </SectionTitle>
          <div className="h-64">
            {pcaAnalytics ? (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis type="number" dataKey="pc1" name="PC1" stroke="#334155" tick={{ fontSize: 9, fill: C.muted }} domain={['auto', 'auto']} />
                  <YAxis type="number" dataKey="pc2" name="PC2" stroke="#334155" tick={{ fontSize: 9, fill: C.muted }} domain={['auto', 'auto']} />
                  <ZAxis range={[18, 18]} />
                  <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11, fontFamily: 'monospace' }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} />
                  <Scatter name="Normal"  data={nasaNormal} fill={C.green} opacity={0.5} />
                  <Scatter name="Anomaly" data={nasaAnom}   fill={C.red}   opacity={0.8} />
                  {livePoint.length > 0 && (
                    <Scatter name="⚡ LIVE" data={livePoint} fill="#fff" />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm font-mono" style={{ color: C.muted }}>
                {connectionStatus === 'connected' ? 'Loading PCA from backend…' : 'Connect to load PCA.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Dataset stats ── */}
      {datasetStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon="💾" label="Training Samples" value={datasetStats.total_samples?.toLocaleString()}
                   sub={datasetStats.train_dataset || 'nasa_test4_features'} />
          <KpiCard icon="🔴" label="Anomalies Detected" value={datasetStats.anomaly_count?.toLocaleString()}
                   sub={`${((datasetStats.anomaly_rate ?? 0) * 100).toFixed(1)}% contamination rate`}
                   accent={C.red + '66'} glow={C.red} />
          <KpiCard icon="📉" label="Max Vib Range"
                   value={`${datasetStats.max_vibration?.min?.toFixed(2)}–${datasetStats.max_vibration?.max?.toFixed(2)}`}
                   unit="g" />
          <KpiCard icon="〜" label="RMS Vib Mean"
                   value={datasetStats.rms_vibration?.mean?.toFixed(4)} unit="g"
                   sub={`±${datasetStats.rms_vibration?.std?.toFixed(4)} std`} />
        </div>
      )}

      {/* ── Model info footer ── */}
      {modelInfo && (
        <div className="rounded-2xl border px-5 py-3 flex flex-wrap gap-x-6 gap-y-2 text-[11px] font-mono"
             style={{ background: C.card, borderColor: C.border, color: C.muted }}>
          <span>MODEL: <span style={{ color: C.text }}>{modelInfo.model_type}</span></span>
          <span>ESTIMATORS: <span style={{ color: C.text }}>{modelInfo.n_estimators}</span></span>
          <span>CONTAMINATION: <span style={{ color: C.text }}>{modelInfo.contamination}</span></span>
          <span>PCA: <span style={{ color: C.text }}>{modelInfo.pca_components}D</span></span>
          <span>TRAIN SET: <span style={{ color: C.text }}>{modelInfo.train_dataset}</span></span>
          <span>TEST SET: <span style={{ color: C.text }}>{modelInfo.test_dataset}</span></span>
          <span>VAR EXPLAINED: <span style={{ color: C.cyan }}>{modelInfo.explained_variance_ratio?.map(v => `${(v * 100).toFixed(1)}%`).join(' + ')}</span></span>
        </div>
      )}
    </div>
  );
};
