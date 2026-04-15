# Project Aegis: Multi-Phase Implementation Plan

**Project Goal:** Build a predictive maintenance platform for industrial machinery that runs on a smartphone, using accelerometer data to detect anomalies via unsupervised ML (Isolation Forest).

**Priority Phase:** Create & Deploy React App for phone access

---

## Executive Summary
The project requires parallel development of backend and frontend components, with mobile-first deployment as the critical path. The React app must connect to the backend via WebSocket to display real-time anomaly scores in a visually intuitive UI.

---

## Phase 1: Backend Foundation (Parallel with Phase 2)
**Status:** Not Started  
**Dependencies:** None  
**Deliverables:** FastAPI WebSocket server, ML pipeline, telemetry processing

### 1.1 Project Structure Setup
- [ ] Create `/core_engine` directory
- [ ] Create `/core_engine/main.py` (FastAPI app)
- [ ] Create `/core_engine/models.py` (Pydantic data models)
- [ ] Create `/core_engine/ml_pipeline.py` (IsolationForest logic)
- [ ] Create `/core_engine/telemetry_processor.py` (Rolling window & feature extraction)
- [ ] Create `requirements.txt` (FastAPI, uvicorn, numpy, sklearn, websockets)

### 1.2 WebSocket Receiver Implementation
- [ ] Implement `/ws/telemetry` endpoint in FastAPI
- [ ] Handle incoming telemetry: `vib_x`, `vib_y`, `vib_z` with timestamps
- [ ] Add connection manager for multiple concurrent clients
- [ ] Implement graceful error handling & connection drops

### 1.3 Telemetry Processing Engine
- [ ] Implement `collections.deque(maxlen=40)` buffer (2-second window at ~20Hz)
- [ ] Calculate Vector Magnitude: `sqrt(X^2 + Y^2 + Z^2)`
- [ ] Extract statistical features:
  - [ ] `max_vibration` = maximum value in window
  - [ ] `rms_vibration` = root mean square of window
- [ ] Add data validation & outlier handling

### 1.4 Machine Learning Model
- [ ] Load pre-trained `IsolationForest` from CWRU dataset (or train on NASA/CWRU)
- [ ] Implement calibration logic: Use first 200 payloads (~10 seconds) as baseline
- [ ] Implement real-time inference: Feed `[max_vibration, rms_vibration]` to model
- [ ] Output anomaly score (0-1) for each window
- [ ] Add model retraining capability (optional for Phase 1)

### 1.5 Broadcasting Anomaly Scores
- [ ] Broadcast anomaly scores to all connected WebSocket clients
- [ ] Include: `timestamp`, `anomaly_score`, `max_vibration`, `rms_vibration`, `alert_status`
- [ ] Implement alert threshold logic (e.g., anomaly_score > 0.7 = CRITICAL)

### 1.6 Testing & Validation
- [ ] Unit tests for feature extraction
- [ ] Unit tests for ML inference
- [ ] Manual WebSocket testing (use `wscat` or similar)

---

## Phase 2: React App Development (PRIORITY PHASE)
**Status:** Not Started  
**Dependencies:** None (can develop in parallel with Phase 1)  
**Deliverables:** Fully functional React app with real-time charts, mobile-optimized UI, connects to backend

### 2.1 Project Setup
- [ ] Create React app: `npx create-react-app command_center`
- [ ] Install dependencies:
  - [ ] `recharts` (live time-series charts)
  - [ ] `tailwindcss` (styling for mobile-first)
  - [ ] `ws` (WebSocket client)
  - [ ] `axios` (optional, for REST calls)
  - [ ] `zustand` or `redux` (state management)

### 2.2 WebSocket Client Integration
- [ ] Create React hook: `useWebSocket()` for connection management
- [ ] Implement auto-reconnect logic (exponential backoff)
- [ ] Handle incoming anomaly score broadcasts
- [ ] Store telemetry history in component state (last 100 data points?)

### 2.3 Core UI Components
- [ ] **Dashboard Layout:**
  - [ ] Header: System status, timestamp, current anomaly score
  - [ ] Real-time Chart: `recharts` LineChart for RMS vibration over time
  - [ ] Alert Panel: Large, high-contrast display for anomaly alerts
  - [ ] Metrics Grid: Current values (max_vibration, rms_vibration, anomaly_score)
  
- [ ] **Chart Component:**
  - [ ] Live time-series plot of `rms_vibration` (append data in real-time)
  - [ ] Color coding: Green (healthy), Yellow (warning), Red (critical)
  - [ ] Responsive: Scales to phone screen sizes
  - [ ] Zoom/Pan capabilities (optional)

- [ ] **Alert Component:**
  - [ ] Modern Brutalist dark grey/green theme (HEALTHY state)
  - [ ] Immediate transition to volcanic red with animation (CRITICAL ALERT)
  - [ ] Audio/haptic feedback on alert (stretch goal)
  - [ ] Historical alert log

### 2.4 Styling & UX
- [ ] Mobile-first responsive design (Tailwind CSS)
- [ ] Dark theme (accessibility for factory floors)
- [ ] Large tap targets (fingers on touchscreen)
- [ ] Landscape + Portrait orientation support
- [ ] Color-blind safe palette (use patterns + colors)

### 2.5 State Management
- [ ] Create store for:
  - [ ] `telemetryData[]` (circular buffer of last N points)
  - [ ] `currentAnomalyScore`
  - [ ] `alertStatus` (HEALTHY, WARNING, CRITICAL)
  - [ ] `connectionStatus` (connected, disconnected, reconnecting)
- [ ] Update store on each WebSocket message

### 2.6 Error Handling & Edge Cases
- [ ] Handle WebSocket disconnection gracefully
- [ ] Display "Connection Lost" banner
- [ ] Cache data locally (IndexedDB or localStorage)
- [ ] Handle slow network (buffer telemetry locally, sync when online)

---

## Phase 3: Mobile Optimization & PWA (Phone Deployment)
**Status:** Not Started  
**Dependencies:** Phase 2 complete  
**Deliverables:** Installable mobile app experience

### 3.1 Progressive Web App Setup
- [ ] Create `public/manifest.json` with app metadata
- [ ] Create `public/service-worker.js` for offline caching
- [ ] Generate app icons (192x192, 512x512)
- [ ] Enable "Add to Home Screen" on iOS/Android
- [ ] Configure PWA metadata in `index.html`

### 3.2 Performance Optimization
- [ ] Code splitting (dynamic imports for chart library)
- [ ] Lazy loading components
- [ ] Optimize bundle size (check with `npm run analyze`)
- [ ] Minify & compress assets
- [ ] Enable GZIP compression on backend

### 3.3 Mobile-Specific Features
- [ ] Disable zoom on mobile (prevent accidental pinch)
- [ ] Full-screen mode (no browser UI)
- [ ] Orientation lock (portrait or landscape, depending on use case)
- [ ] Haptic feedback on alerts (using Vibration API)
- [ ] Screen brightness control (option to keep screen on)

### 3.4 Testing on Devices
- [ ] Test on Android phone (Chrome, Firefox)
- [ ] Test on iPhone/iPad (Safari)
- [ ] Test on tablet (landscape orientation)
- [ ] Check performance on 4G/5G networks
- [ ] Check performance on WiFi

---

## Phase 4: Deployment & Hosting
**Status:** Not Started  
**Dependencies:** Phase 2 & 3 complete  
**Deliverables:** Live, accessible web app at public URL

### 4.1 Backend Deployment
- [ ] Choose hosting provider:
  - [ ] Option A: Heroku (free tier, Procfile included)
  - [ ] Option B: PythonAnywhere (Python-friendly)
  - [ ] Option C: Railway or Render (modern alternatives)
  - [ ] Option D: AWS/GCP/Azure (scalable, but more complex)
- [ ] Set environment variables (CORS, allowed origins)
- [ ] Deploy FastAPI app
- [ ] Configure HTTPS/SSL certificate
- [ ] Test WebSocket connectivity from frontend

### 4.2 Frontend Deployment
- [ ] Choose hosting provider:
  - [ ] Option A: Vercel (Next.js optimized, but works with React)
  - [ ] Option B: Netlify (static hosting, easy CI/CD)
  - [ ] Option C: Firebase Hosting (free tier, SSL included)
  - [ ] Option D: AWS S3 + CloudFront
- [ ] Build optimized bundle: `npm run build`
- [ ] Deploy built files
- [ ] Configure environment variables (backend WebSocket URL)
- [ ] Enable auto-deploy on GitHub push (CI/CD pipeline)

### 4.3 CORS & WebSocket Configuration
- [ ] Configure backend to accept requests from frontend URL
- [ ] Enable WebSocket from frontend domain
- [ ] Test cross-origin requests

### 4.4 Domain & HTTPS
- [ ] Purchase domain (optional)
- [ ] Configure SSL/TLS certificate (Let's Encrypt)
- [ ] Set up DNS records

### 4.5 Monitoring & Logging
- [ ] Set up error tracking (Sentry or similar)
- [ ] Monitor API performance
- [ ] Monitor WebSocket connections
- [ ] Set up uptime alerts

---

## Phase 5: Integration & Testing
**Status:** Not Started  
**Dependencies:** Phase 1-4 complete  
**Deliverables:** End-to-end testsuite, verified system

### 5.1 Integration Testing
- [ ] Test telemetry flow: Phone → Backend → Frontend
- [ ] Test WebSocket persistence (30+ minute streaming)
- [ ] Test multiple concurrent connections
- [ ] Test data accuracy (compare feature extraction with gold datasets)

### 5.2 ML Validation
- [ ] Validate IsolationForest predictions on NASA dataset
- [ ] Validate on CWRU dataset
- [ ] Test anomaly thresholds (confusion matrix, ROC curve)
- [ ] A/B test different model hyperparameters

### 5.3 Load Testing
- [ ] Simulate 100+ concurrent users
- [ ] Test backend under sustained telemetry load (~20 Hz × 100 users)
- [ ] Measure latency (target: <500ms anomaly score delivery)

### 5.4 Security Testing
- [ ] Scan for XSS vulnerabilities
- [ ] Test CORS policy
- [ ] Validate input sanitization
- [ ] Test WebSocket authentication (if implementing)

### 5.5 Documentation
- [ ] API documentation (Swagger/OpenAPI)
- [ ] Frontend component documentation (Storybook)
- [ ] Deployment guide
- [ ] User manual

---

## Phase 6: Production Hardening & Optimization
**Status:** Not Started  
**Dependencies:** Phase 5 complete  
**Deliverables:** Production-ready system

### 6.1 Performance Optimization
- [ ] Profile and optimize backend (measure DB queries, WebSocket throughput)
- [ ] Optimize React rendering (React DevTools Profiler)
- [ ] Cache historical data efficiently
- [ ] Implement data compression for WebSocket messages

### 6.2 Reliability
- [ ] Implement graceful shutdown (finish pending messages)
- [ ] Add circuit breaker for failed ML inferences
- [ ] Implement model versioning & rollback capability
- [ ] Set up automatic backups (if storing any data)

### 6.3 Scalability
- [ ] Consider horizontal scaling (load balancer for backend)
- [ ] Implement CDN for static assets (frontend)
- [ ] Consider database for historical data (if needed)

### 6.4 Feature Enhancements (Post-MVP)
- [ ] User authentication & authorization
- [ ] Multi-machine monitoring dashboard
- [ ] Historical anomaly logs & reporting
- [ ] ML model update mechanism
- [ ] Mobile telemetry sender app (Android/iOS native)

---

## Technology Stack Summary

| Component | Technology | Notes |
|-----------|-----------|-------|
| Backend API | FastAPI | Async, WebSocket support |
| ML Framework | scikit-learn | IsolationForest |
| Frontend | React 18+ | Create React App |
| Charts | Recharts | React-friendly charting |
| Styling | Tailwind CSS | Mobile-first utility framework |
| State Management | Zustand or Redux | Lightweight option recommended |
| PWA | Service Workers | Offline capability, installable |
| Frontend Hosting | Vercel or Netlify | Easy deployment, auto SSL |
| Backend Hosting | Railway or Render | Python-friendly, WebSocket support |
| Monitoring | Sentry | Error tracking |

---

## Success Criteria

### Phase 1 (Backend)
- [x] FastAPI server starts without errors
- [x] WebSocket endpoint accepts connections
- [x] Feature extraction produces correct values (validated against gold datasets)
- [x] IsolationForest predictions match expected anomaly scores

### Phase 2 (React App) - **PRIORITY**
- [x] React app builds successfully
- [x] Connects to WebSocket and receives data
- [x] Charts update in real-time
- [x] Alert UI changes color on anomaly
- [x] Works on mobile browser (portrait & landscape)

### Phase 3 (Mobile PWA)
- [x] App is installable on home screen
- [x] App works offline (cached HTML/JS/CSS)
- [x] Haptic feedback triggers on alert
- [x] No browser UI visible in full-screen mode

### Phase 4 (Deployment)
- [x] Frontend accessible at public URL
- [x] Backend accessible at public URL
- [x] WebSocket connects from frontend to backend across internet
- [x] HTTPS enabled (green lock in browser)

### Phase 5 (Integration)
- [x] End-to-end telemetry flow works
- [x] Data accuracy matches gold datasets
- [x] System handles 100+ concurrent connections
- [x] Anomaly alerts deliver in <500ms

### Phase 6 (Production)
- [x] System handles 1000+ concurrent connections
- [x] <1% error rate
- [x] 99.9% uptime SLA

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| WebSocket latency too high | Medium | High | Implement message batching, optimize backend |
| Model drift (accuracy degrades) | Medium | High | Implement model monitoring, retraining pipeline |
| Mobile browser compatibility | Low | Medium | Test on multiple devices early |
| CORS issues during deployment | High | Low | Configure carefully, use headers |
| Scaling issues under load | Medium | High | Load test early, use CDN/load balancer |

---

## Timeline Estimate

Assuming solo developer, working part-time (~20 hrs/week):

- **Phase 1 (Backend):** 1-2 weeks
- **Phase 2 (React App - PRIORITY):** 2-3 weeks  ← Start here in parallel
- **Phase 3 (Mobile PWA):** 3-5 days
- **Phase 4 (Deployment):** 3-5 days
- **Phase 5 (Testing):** 1 week
- **Phase 6 (Hardening):** 1 week

**Total:** ~6-8 weeks to production-ready system

---

## Next Steps

1. **Immediate (This Week):**
   - [ ] Set up Git repository with `.gitignore`
   - [ ] Create Python virtual environment for backend
   - [ ] Bootstrap FastAPI project structure
   - [ ] Create React app with Tailwind CSS
   - [ ] Stub out WebSocket connections in frontend

2. **This Sprint:**
   - [ ] Implement backend telemetry processor (Phase 1.3)
   - [ ] Implement React dashboard with mock data (Phase 2.3)
   - [ ] Get basic frontend-backend connection working

3. **Next Sprint:**
   - [ ] Complete ML pipeline integration (Phase 1.4)
   - [ ] Complete UI and mobile optimization (Phase 2.5, Phase 3)
   - [ ] Deploy to staging environment

---

## Notes for AI Coding Assistant

When implementing:
1. **Follow exact feature extraction logic** from `project_aegis_context.md` (Vector Magnitude, RMS, Max)
2. **Use real hyperparameters** from CWRU/NASA datasets (don't guess at IsolationForest params)
3. **Prioritize mobile responsiveness**—this is the critical path for Phase 2
4. **Use WebSocket for real-time** (not polling)—the architecture depends on it
5. **Test on actual phones early**—mobile browsers behave differently
6. **Keep it stateless**—backend should not need a database for MVP

---

**Document Version:** 1.0  
**Last Updated:** April 15, 2026  
**Status:** Ready for Phase 1 & 2 Implementation
