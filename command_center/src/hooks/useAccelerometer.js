/**
 * useAccelerometer.js
 *
 * Hook that:
 *  1. Requests DeviceMotion permission (required on iOS 13+)
 *  2. Streams accelerometer data to the backend via WebSocket
 *
 * HTTPS NOTE:
 *   DeviceMotionEvent is ONLY available on secure origins (HTTPS).
 *   On Vercel (frontend) + Render (backend), both are HTTPS by default.
 *   The WebSocket upgrade must also be WSS (not WS) in production.
 *
 * FLOW:
 *   Phone opens the Vercel URL → user taps "Start Monitoring" →
 *   iOS/Android prompts for motion sensor permission →
 *   on grant, we stream vib_x/y/z at 20Hz to the Render backend →
 *   backend processes, runs ML, and broadcasts anomaly scores to all
 *   dashboard clients connected on the same WebSocket.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';

const SEND_INTERVAL_MS = 50; // 20 Hz

export const useAccelerometer = (wsUrl) => {
  const [permission, setPermission] = useState('unknown'); // unknown | granted | denied | unavailable
  const [isStreaming, setIsStreaming] = useState(false);
  const wsRef = useRef(null);
  const accelRef = useRef({ x: 0, y: 0, z: 0 });
  const intervalRef = useRef(null);
  const { setConnectionStatus } = useStore();

  // ── WebSocket setup ──────────────────────────────────────────────────
  const connectWS = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    setConnectionStatus('connecting');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      console.log('[Aegis] WebSocket connected:', wsUrl);
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      console.log('[Aegis] WebSocket closed');
    };

    ws.onerror = (e) => {
      console.error('[Aegis] WebSocket error:', e);
    };
  }, [wsUrl, setConnectionStatus]);

  // ── Send accel data at 20 Hz ─────────────────────────────────────────
  const startStreaming = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        const { x, y, z } = accelRef.current;
        ws.send(JSON.stringify({
          vib_x: x,
          vib_y: y,
          vib_z: z,
          timestamp: Date.now() / 1000,
        }));
      }
    }, SEND_INTERVAL_MS);
    setIsStreaming(true);
  }, []);

  const stopStreaming = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  // ── DeviceMotion listener ────────────────────────────────────────────
  const attachMotionListener = useCallback(() => {
    const handler = (event) => {
      // Prefer gravity-compensated acceleration (pure vibration signal).
      // Fall back to accelerationIncludingGravity if unavailable (some Android).
      // Convert m/s² → g by dividing by 9.81 to match CWRU/NASA training data units.
      const G = 9.81;
      let x = 0, y = 0, z = 0;

      const a = event.acceleration;
      const ag = event.accelerationIncludingGravity;

      if (a && (a.x !== null || a.y !== null || a.z !== null)) {
        // Gravity-removed: pure vibration (ideal)
        x = (a.x ?? 0) / G;
        y = (a.y ?? 0) / G;
        z = (a.z ?? 0) / G;
      } else if (ag) {
        // Gravity included: subtract ~1g from Z to approximate vibration
        x = (ag.x ?? 0) / G;
        y = (ag.y ?? 0) / G;
        z = ((ag.z ?? 0) - G) / G; // subtract gravity from Z axis
      }

      accelRef.current = { x, y, z };
    };
    window.addEventListener('devicemotion', handler);
    return () => window.removeEventListener('devicemotion', handler);
  }, []);

  // ── Permission request ───────────────────────────────────────────────
  const requestPermission = useCallback(async () => {
    // Check if DeviceMotionEvent is available at all
    if (typeof DeviceMotionEvent === 'undefined') {
      setPermission('unavailable');
      console.warn('[Aegis] DeviceMotionEvent not available in this browser');
      return;
    }

    // iOS 13+ requires explicit permission request
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const result = await DeviceMotionEvent.requestPermission();
        setPermission(result); // 'granted' | 'denied'
        if (result === 'granted') {
          connectWS();
          attachMotionListener();
          startStreaming();
        }
      } catch (err) {
        console.error('[Aegis] Permission request failed:', err);
        setPermission('denied');
      }
    } else {
      // Android / Desktop Chrome — permission auto-granted
      setPermission('granted');
      connectWS();
      attachMotionListener();
      startStreaming();
    }
  }, [connectWS, attachMotionListener, startStreaming]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopStreaming();
      if (wsRef.current) wsRef.current.close();
    };
  }, [stopStreaming]);

  return {
    permission,
    isStreaming,
    requestPermission,
    stopStreaming,
  };
};
