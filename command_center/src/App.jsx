import React from 'react';
import { Dashboard } from './components/Dashboard';
import { useMetricsSocket } from './hooks/useMetricsSocket';

function App() {
  // Use Vercel production WS URL if available, fallback to local host
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/telemetry';
  useMetricsSocket(wsUrl);

  return (
    <div className="font-sans antialiased bg-brutal-dark text-brutal-text min-h-screen">
      <Dashboard />
    </div>
  );
}

export default App;
