import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, ScatterChart, Scatter, ZAxis, ReferenceLine, Legend, LineChart, Line,
  BarChart, Bar, Cell
} from 'recharts';
import { useStore } from '../store/useStore';

const WS_URL   = import.meta.env.VITE_WS_URL   || 'ws://localhost:8000/ws/telemetry';
const API_BASE = import.meta.env.VITE_API_BASE  || 'http://localhost:8000';

// ─── Ultra-Premium Bento Grid Theme ──────────────────────────────────────────
const C = {
  brand:    '#8b5cf6',   // violet
  brandGlo: '#8b5cf633',
  cyan:     '#06b6d4',
  green:    '#10b981',
  amber:    '#fbbf24',
  red:      '#f43f5e',   // rose
  muted:    '#94a3b8',
  panel:    '#0f172a',
  card:     '#1e293b',   // slate-800
  border:   '#334155',   // slate-700
  text:     '#f8fafc',
};

const alertPalette = {
  IDLE:     { hex: C.muted,  bg: 'from-slate-800 to-slate-900', text: 'text-slate-300' },
  HEALTHY:  { hex: C.green,  bg: 'from-emerald-900/60 to-slate-900', text: 'text-emerald-300' },
  WARNING:  { hex: C.amber,  bg: 'from-amber-900/60 to-slate-900',   text: 'text-amber-300' },
  CRITICAL: { hex: C.red,    bg: 'from-rose-900/70 to-slate-900',    text: 'text-rose-300' },
};

// ─── Micro Utilities ─────────────────────────────────────────────────────────
const Dot = ({ on, color = '#10b981' }) => (
  <span className="relative flex h-2.5 w-2.5">
    {on && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: color }} />}
    <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: on ? color : '#475569' }} />
  </span>
);

const Badge = ({ children, color = C.brand }) => (
  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold tracking-widest uppercase border backdrop-blur-sm"
        style={{ color, borderColor: color + '55', background: color + '15' }}>
    {children}
  </span>
);

const SectionTitle = ({ children, right }) => (
  <div className="flex justify-between items-center mb-3">
    <h2 className="text-[12px] font-bold tracking-[0.15em] uppercase text-slate-400">{children}</h2>
    {right}
  </div>
);

// ─── Progress bar ─────────────────────────────────────────────────────────────
const StreamProgress = ({ index, total }) => {
  const pct = total > 0 ? ((index / total) * 100).toFixed(1) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-mono" style={{ color: C.muted }}>
        <span>DATASET: nasa_test2 (streaming)</span>
        <span>{index} / {total} — {pct}%</span>
      </div>
      <div className="w-full rounded-full h-1" style={{ background: '#0f172a' }}>
        <div className="h-1 rounded-full transition-all duration-300"
             style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${C.brand}, ${C.cyan})`, boxShadow: `0 0 10px ${C.brand}88` }} />
      </div>
    </div>
  );
};

// ─── Dashboard Boot ──────────────────────────────────────────────────────────
export const Dashboard = () => {
  const {
    currentScore, currentMax, currentRms, currentMape, mapeHistory,
    alertStatus, connectionStatus, telemetryData, currentPca, rowProgress,
    pcaAnalytics, datasetStats, modelInfo, simulatorRunning,
    setConnectionStatus, addTelemetry, setSimulatorRunning,
    setPcaAnalytics, setDatasetStats, setModelInfo,
  } = useStore();

  const wsRef = useRef(null);
  const [simBusy, setSimBusy] = useState(false);

  // ── WebSocket ──
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

  // ── API Fetch ──
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
      } catch (e) { console.warn('boot fetch failed', e); }
    };
    boot();
  }, [setPcaAnalytics, setDatasetStats, setModelInfo, setSimulatorRunning]);

  const toggleSimulator = useCallback(async () => {
    setSimBusy(true);
    try {
      const action = simulatorRunning ? 'stop' : 'start';
      const res = await fetch(`${API_BASE}/api/simulator/${action}`, { method: 'POST' });
      if (res.ok) setSimulatorRunning(!simulatorRunning);
    } catch (e) { console.error('simulator toggle failed', e); }
    setSimBusy(false);
  }, [simulatorRunning, setSimulatorRunning]);

  // ── Derived Data ──
  const chartData = telemetryData.map((d, i) => ({
    i, rms: +(d.rms_vibration ?? 0).toFixed(4), max: +(d.max_vibration ?? 0).toFixed(4), score: +(d.anomaly_score ?? 0).toFixed(4)
  }));

  const palette = alertPalette[alertStatus] || alertPalette.HEALTHY;
  const isCritical = alertStatus === 'CRITICAL';
  
  const pcaPoints = pcaAnalytics?.points || [];
  const nasaNormal = pcaPoints.filter(p => !p.is_anomaly);
  const nasaAnom = pcaPoints.filter(p => p.is_anomaly);
  const livePoint = (currentPca.pc1 !== 0 || currentPca.pc2 !== 0)
    ? [{ pc1: currentPca.pc1, pc2: currentPca.pc2, anomaly_score: currentScore }]
    : [];

  const connColor = connectionStatus === 'connected' ? C.green : connectionStatus === 'connecting' ? C.amber : C.red;
  
  // Model comparison mock data from advanced metrics (if available)
  const renderAdvancedMetrics = () => {
    if (!modelInfo?.static_metrics) return null;
    const sm = modelInfo.static_metrics;
    
    // Performance comparison for RUL predictors
    const modelComparisonData = [
      { name: 'Functional MLP', r2: sm.functional_mlp?.r2 || 0, mae: sm.functional_mlp?.mae || 0 },
      { name: 'Gaussian Process', r2: sm.gaussian_process?.r2 || 0, mae: sm.gaussian_process?.mae || 0 }
    ];

    return (
      <div className="p-5 rounded-[20px] border col-span-12 lg:col-span-8 flex flex-col justify-between relative overflow-hidden" 
           style={{ background: C.card, borderColor: C.border }}>
        <div className="absolute top-0 right-0 p-3 opacity-10">
          <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
        </div>
        
        <SectionTitle>Advanced Functional Modeling (FDA & Deep Learning)</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 z-10 w-full mb-4">
          <div className="p-3 bg-[#0f172a88] rounded-xl border border-slate-700/50 backdrop-blur">
            <p className="text-[10px] text-slate-400 font-bold mb-1">UNSUPERVISED (IF)</p>
            <p className="text-xl font-mono text-cyan-300">{sm.isolation_forest?.accuracy?.toFixed(1)}% ACC</p>
          </div>
          <div className="p-3 bg-[#0f172a88] rounded-xl border border-slate-700/50 backdrop-blur">
            <p className="text-[10px] text-slate-400 font-bold mb-1">SUPERVISED (RF-CNN)</p>
            <p className="text-xl font-mono text-violet-300">{sm.supervised_cnn_proxy?.accuracy?.toFixed(1)}% ACC</p>
          </div>
          <div className="p-3 bg-[#0f172a88] rounded-xl border border-slate-700/50 backdrop-blur">
            <p className="text-[10px] text-slate-400 font-bold mb-1">FDA MLP RUL (R²)</p>
            <p className="text-xl font-mono text-emerald-300">{sm.functional_mlp?.r2?.toFixed(3)}</p>
          </div>
          <div className="p-3 bg-[#0f172a88] rounded-xl border border-slate-700/50 backdrop-blur">
            <p className="text-[10px] text-slate-400 font-bold mb-1">DGP UNCERTAINTY</p>
            <p className="text-xl font-mono text-rose-300">±{sm.gaussian_process?.avg_uncertainty?.toFixed(3)} σ</p>
          </div>
        </div>

        <div className="h-40 z-10 w-full mt-2">
           <ResponsiveContainer width="100%" height="100%">
             <BarChart data={modelComparisonData} layout="vertical" margin={{ top: 0, right: 30, left: 30, bottom: 0 }}>
               <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#1e293b" />
               <XAxis type="number" stroke="#475569" tick={{ fontSize: 10 }} />
               <YAxis dataKey="name" type="category" stroke="#94a3b8" tick={{ fontSize: 11 }} width={120} />
               <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }} />
               <Legend wrapperStyle={{ fontSize: 11 }} />
               <Bar dataKey="r2" name="R² Score (Higher is Better)" fill={C.brand} radius={[0, 4, 4, 0]} barSize={12} />
               <Bar dataKey="mae" name="MAE Error (Lower is Better)" fill={C.cyan} radius={[0, 4, 4, 0]} barSize={12} />
             </BarChart>
           </ResponsiveContainer>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen text-slate-100 p-3 md:p-6 bg-[#020617] font-['Inter'] selection:bg-violet-900 overflow-x-hidden">
      
      {/* ── BENTO GRID LAYOUT ── */}
      <div className="max-w-screen-2xl mx-auto space-y-4">
        
        {/* HEADER & CONTROLS */}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-8 p-5 rounded-[20px] bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 flex flex-col justify-center relative overflow-hidden">
             {/* Neon decoration */}
             <div className="absolute -top-[100px] -right-[100px] w-[300px] h-[300px] bg-violet-600/20 rounded-full blur-[80px]" />
             <div className="absolute -bottom-[100px] -left-[100px] w-[300px] h-[300px] bg-cyan-600/10 rounded-full blur-[80px]" />
             
             <div className="flex items-center gap-4 relative z-10">
                <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center border border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.3)]">
                  <svg className="w-7 h-7 text-violet-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2zm0 4l6.5 13h-13L12 6z"/></svg>
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-violet-300 to-cyan-300">
                    AEGIS COMMAND CENTER
                  </h1>
                  <p className="text-xs text-slate-400 font-mono tracking-widest mt-1">ADVANCED PREDICTIVE MAINTENANCE ENGINE v3.0</p>
                </div>
             </div>
          </div>

          <div className="col-span-12 md:col-span-4 p-5 rounded-[20px] bg-slate-800 border border-slate-700/50 flex flex-col justify-center gap-3">
             <div className="flex justify-between items-center w-full">
               <div className="flex items-center gap-2">
                 <Dot on={connectionStatus === 'connected'} color={connColor} />
                 <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">SYS_LINK: {connectionStatus}</span>
               </div>
               {modelInfo?.is_trained && <Badge color={C.green}>ML CORE ONLINE</Badge>}
             </div>
             
             {/* THE START / STOP BUTTON THE USER WANTED */}
             <button
                onClick={toggleSimulator}
                disabled={simBusy}
                className="w-full py-3 rounded-xl font-bold tracking-widest text-xs transition-all duration-300 shadow-lg relative overflow-hidden group border"
                style={{
                  background: simulatorRunning ? 'linear-gradient(135deg, #9f1239, #e11d48)' : 'linear-gradient(135deg, #4c1d95, #6d28d9)',
                  borderColor: simulatorRunning ? '#f43f5e' : '#8b5cf6',
                  color: '#fff',
                }}>
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {simBusy ? '⏳ PROCESSING...' : simulatorRunning ? '⏹ HALT SIMULATION STREAM' : '▶ INITIATE TELEMETRY STREAM'}
                </span>
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
             </button>
             {simulatorRunning && <StreamProgress index={rowProgress.index} total={rowProgress.total} />}
          </div>
        </div>

        {/* STATUS & LIVE VIBRATION CHARTS */}
        <div className="grid grid-cols-12 gap-4">
          {/* Big Status Banner */}
          <div className={`col-span-12 lg:col-span-4 p-6 rounded-[20px] bg-gradient-to-br ${palette.bg} border flex flex-col justify-between transition-colors duration-700`}
               style={{ borderColor: palette.hex + '44' }}>
            <SectionTitle right={<span className={`text-[10px] font-mono px-2 py-0.5 rounded border border-${palette.hex}/30 bg-${palette.hex}/10`} style={{color: palette.hex}}>{simulatorRunning ? 'LIVE DATA' : 'OFFLINE'}</span>}>
              System Status
            </SectionTitle>
            <div className={`text-6xl font-black font-mono tracking-tighter my-4 ${palette.text} ${isCritical ? 'animate-pulse' : ''}`}>
              {simulatorRunning ? alertStatus : 'STBY'}
            </div>
            
            <div className="grid grid-cols-2 gap-2 mt-auto">
              <div className="bg-[#00000033] p-3 rounded-xl border border-white/5">
                <p className="text-[10px] text-slate-400 font-mono">ANOMALY CONFIDENCE</p>
                <p className="text-2xl font-mono mt-1" style={{color: palette.hex}}>{(currentScore * 100).toFixed(1)}%</p>
              </div>
              <div className="bg-[#00000033] p-3 rounded-xl border border-white/5">
                <p className="text-[10px] text-slate-400 font-mono">STREAMING MAPE</p>
                <p className={`text-2xl font-mono mt-1 ${currentMape > 15 ? 'text-rose-400' : 'text-emerald-400'}`}>{currentMape.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          {/* Timeseries Charts */}
          <div className="col-span-12 lg:col-span-8 p-5 rounded-[20px] border flex flex-col" style={{ background: C.card, borderColor: C.border }}>
             <SectionTitle>High-Frequency Vibration Telemetry (NASA Test 2 Pipeline)</SectionTitle>
             <div className="h-64 mt-2">
               <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                   <defs>
                     <linearGradient id="gMax" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.brand} stopOpacity={0.4} /><stop offset="95%" stopColor={C.brand} stopOpacity={0} /></linearGradient>
                     <linearGradient id="gRms" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={C.cyan} stopOpacity={0.4} /><stop offset="95%" stopColor={C.cyan} stopOpacity={0} /></linearGradient>
                   </defs>
                   <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                   <XAxis dataKey="i" hide />
                   <YAxis stroke="#475569" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                   <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} />
                   <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                   <Area type="step" dataKey="max" name="Max Vibration (g)" stroke={C.brand} fill="url(#gMax)" strokeWidth={2} isAnimationActive={false} />
                   <Area type="step" dataKey="rms" name="RMS Vibration (g)" stroke={C.cyan} fill="url(#gRms)" strokeWidth={2} isAnimationActive={false} />
                 </AreaChart>
               </ResponsiveContainer>
             </div>
          </div>
        </div>

        {/* PCA & ADVANCED METRICS */}
        <div className="grid grid-cols-12 gap-4">
          
          {/* PCA Scatter */}
          <div className="col-span-12 lg:col-span-4 p-5 rounded-[20px] border flex flex-col" style={{ background: C.card, borderColor: C.border }}>
            <SectionTitle>IsolationForest PCA State</SectionTitle>
            <div className="h-64">
              {pcaAnalytics ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" dataKey="pc1" stroke="#475569" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                    <YAxis type="number" dataKey="pc2" stroke="#475569" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                    <ZAxis range={[20, 20]} />
                    <Tooltip contentStyle={{ background: '#020617', border: '1px solid #334155', borderRadius: 8 }} />
                    <Scatter name="Normal" data={nasaNormal} fill={C.green} opacity={0.3} isAnimationActive={false} />
                    <Scatter name="Anomaly" data={nasaAnom} fill={C.red} opacity={0.5} isAnimationActive={false} />
                    {livePoint.length > 0 && <Scatter name="⚡ LIVE" data={livePoint} fill="#fff" shape="star" isAnimationActive={false} />}
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs font-mono text-slate-500">AWAITING PCA METRICS...</div>
              )}
            </div>
            {pcaAnalytics && (
              <p className="text-[10px] text-center text-slate-400 mt-3 font-mono">
                {datasetStats?.train_dataset || 'nasa_test4_features'} projection
              </p>
            )}
          </div>

          {/* New Metrics Models Module */}
          {renderAdvancedMetrics()}
          
        </div>

      </div>
    </div>
  );
};
