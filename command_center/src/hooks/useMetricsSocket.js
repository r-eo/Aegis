import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';

export const useMetricsSocket = (url) => {
  const wsRef = useRef(null);
  const { setConnectionStatus, addTelemetry } = useStore();

  useEffect(() => {
    let reconnectTimeout = null;

    const connect = () => {
      setConnectionStatus('connecting');
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        console.log('Connected to backend telemetry WebSocket.');
        setConnectionStatus('connected');
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          addTelemetry(data);
        } catch (err) {
          console.error("Failed to parse websocket message", err);
        }
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket closed. Reconnecting in 3s...');
        setConnectionStatus('disconnected');
        reconnectTimeout = setTimeout(connect, 3000);
      };

      wsRef.current.onerror = (err) => {
        console.error('WebSocket Error:', err);
        wsRef.current.close();
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [url, addTelemetry, setConnectionStatus]);

  return wsRef.current;
};
