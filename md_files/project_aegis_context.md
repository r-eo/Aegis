# Project Aegis: System Architecture & Data Science Context
**Version:** 1.0
**Target Audience:** AI Coding Assistant (Cursor, Devin, Copilot)
**Objective:** Provide full architectural, mathematical, and data context so the agent can build the backend and frontend microservices correctly.

---

## 1. Project Overview
**Project Aegis** is an edge-driven predictive maintenance platform for industrial machinery (specifically targeted at MSMEs using legacy CNC machines). It uses unsupervised machine learning to detect micro-anomalies (like bearing spalling) before catastrophic failure occurs.

**The Hackathon Constraint & Hardware Proxy:**
We cannot bring a 5-ton CNC machine to the hackathon. Instead, we are using a **smartphone's hardware accelerometer** as a proxy for an industrial piezoelectric sensor. 
* The phone captures 3D telemetry (X, Y, Z axes).
* To mathematically map this to a 1D industrial sensor, the backend calculates the **Vector Magnitude**: `sqrt(X^2 + Y^2 + Z^2)`.
* This proves the real-time WebSocket architecture works, while the logic remains identical to enterprise deployments.

---

## 2. The Data Science & Machine Learning Pipeline
We are using an **Unsupervised Machine Learning** model (`sklearn.ensemble.IsolationForest`). Real-world MSMEs do not have labeled failure data, so supervised learning is impossible.

### The Rolling Window Logic (Crucial for the Agent to Understand)
We do not feed raw, point-by-point telemetry into the ML model. The backend must implement a sliding window:
1. Data streams in at ~20Hz via WebSockets.
2. The backend buffers this data into a `collections.deque(maxlen=40)` (holding ~2 seconds of data).
3. Once full, the backend extracts **Time-Domain Statistical Features** from that window—specifically, the **Maximum Amplitude (`max_vibration`)** and **Root Mean Square (`rms_vibration`)**.
4. These extracted features (not the raw wave) are fed into `IsolationForest.predict()`.

---

## 3. Dataset Context (Validation & Ground Truth)
To defend the architecture to the judges, the pipeline perfectly mimics two gold-standard predictive maintenance datasets. The data engineering for both is already complete.

### A. The NASA IMS Bearing Dataset (Test Set 2)
* **What it is:** A 35-day "Run-to-Failure" test proving machines degrade exponentially over time.
* **How it was cleaned:** We ignored the raw 20,000 Hz noise and extracted the features. The dataset was compressed from millions of rows into exactly **984 rows**.
* **Cleaned Schema:** `timestamp_id`, `max_vibration`, `rms_vibration`.
* **Agent Note:** The backend you write for the live mobile phone will calculate *these exact same two features* (`max_vibration`, `rms_vibration`) so our live demo is mathematically identical to the NASA data.

### B. The CWRU (Case Western) Bearing Dataset
* **What it is:** Benchmarks high-frequency mechanical faults (inner/outer race spalling).
* **How it was cleaned:** We took the time-domain feature file (`feature_time_48k_2048_load_1.csv`) and completely dropped the `fault` label column.
* **Why:** This forces the data into an unsupervised state, proving our Isolation Forest can detect the distinct physical signature of a fault (violent spikes in Kurtosis and RMS) without ever being trained on what a fault looks like.

---

## 4. Execution Directives for the AI Agent

**Phase 1: Python FastAPI Backend (`/core_engine/main.py`)**
* Implement the WebSocket receiver at `/ws/telemetry`.
* Implement the 40-tick `collections.deque`.
* Calculate the Vector Magnitude from the incoming `vib_x`, `vib_y`, `vib_z`.
* Calculate `max_vibration` and `rms_vibration` from the deque window using `numpy`.
* Calibrate the `IsolationForest` on the first 200 payloads (10 seconds of baseline healthy data).
* Run inference on subsequent windows and broadcast the anomaly score to the frontend.

**Phase 2: React Command Center (`/command_center`)**
* Establish a WebSocket listener to catch the backend's anomaly scores.
* Build a live-scrolling time-series chart (e.g., using Recharts) that maps the `rms_vibration`.
* Implement a state-based UI theme: Default is "Modern Brutalist" dark grey/green (HEALTHY). If an anomaly is flagged, immediately lock the chart and flash high-contrast volcanic red (CRITICAL ALERT).

---
**End of Context Document.** Agent: Please acknowledge these architectural constraints and begin Phase 1.
