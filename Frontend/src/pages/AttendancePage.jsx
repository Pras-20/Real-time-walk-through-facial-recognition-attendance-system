import React, { useRef, useState, useEffect, useCallback } from 'react';

const API = 'http://127.0.0.1:8000';
const POLL_INTERVAL_MS   = 1500;   // How often to ping /detect-presence
const STABLE_HOLD_SEC    = 3;      // Seconds face must remain to trigger recognition
const RESULT_DISPLAY_SEC = 5;      // Seconds to show the result card

// States the scanner can be in
const STATES = {
  SCANNING:    'scanning',    // Looking for a face
  COUNTDOWN:   'countdown',  // Face found, counting down
  RECOGNIZING: 'recognizing',// Sending frames to /recognize
  RESULT:      'result',     // Showing result
};

function formatTime(d) {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function formatDate(d) {
  return d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export default function AttendancePage() {
  const videoRef        = useRef(null);
  const pollTimerRef    = useRef(null);
  const countdownRef    = useRef(null);
  const resultTimerRef  = useRef(null);

  const [state, setState]       = useState(STATES.SCANNING);
  const [countdown, setCountdown] = useState(STABLE_HOLD_SEC);
  const [result, setResult]      = useState(null);  // { name, studentId, newly_marked, message }
  const [log, setLog]            = useState([]);
  const [markedCount, setMarked] = useState(0);
  const [cameraReady, setReady]  = useState(false);
  const [now, setNow]            = useState(new Date());

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Webcam setup
  useEffect(() => {
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setReady(true);
        }
      } catch {
        alert('Camera access denied. Please allow webcam permissions and reload.');
      }
    })();
    return () => { stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  // Capture a single JPEG blob
  const captureFrame = useCallback(() => new Promise(resolve => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return resolve(null);
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    ctx.translate(c.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0);
    c.toBlob(resolve, 'image/jpeg', 0.88);
  }), []);

  // ── Recognition (called after countdown completes) ─────────────────
  const runRecognition = useCallback(async () => {
    setState(STATES.RECOGNIZING);
    try {
      const fd = new FormData();
      for (let i = 0; i < 3; i++) {
        const blob = await captureFrame();
        if (blob) fd.append('frames', blob, `frame${i}.jpg`);
        await new Promise(r => setTimeout(r, 300));
      }
      const resp = await fetch(`${API}/recognize`, { method: 'POST', body: fd });
      const data = await resp.json();

      if (resp.ok && data.status === 'success') {
        const entry = {
          name: data.name,
          studentId: data.studentId,
          newly_marked: data.newly_marked,
          time: new Date(),
        };
        setResult({ ...entry, message: data.message });
        setLog(prev => [entry, ...prev.slice(0, 49)]);
        if (data.newly_marked) setMarked(c => c + 1);
      } else {
        setResult({ error: data.detail || 'Could not identify face.' });
      }
    } catch (err) {
      setResult({ error: 'Server connection failed.' });
    }

    setState(STATES.RESULT);

    // Auto-reset after RESULT_DISPLAY_SEC
    resultTimerRef.current = setTimeout(() => {
      setResult(null);
      setCountdown(STABLE_HOLD_SEC);
      setState(STATES.SCANNING);
    }, RESULT_DISPLAY_SEC * 1000);
  }, [captureFrame]);

  // ── Polling loop: check for face presence ─────────────────────────
  useEffect(() => {
    if (!cameraReady) return;

    const poll = async () => {
      // Only poll in SCANNING state
      if (state !== STATES.SCANNING) return;

      const blob = await captureFrame();
      if (!blob) return;

      try {
        const fd = new FormData();
        fd.append('frame', blob, 'presence.jpg');
        const resp = await fetch(`${API}/detect-presence`, { method: 'POST', body: fd });
        const { face_detected } = await resp.json();

        if (face_detected) {
          // Start countdown
          setState(STATES.COUNTDOWN);
        }
      } catch { /* network issue — keep polling */ }
    };

    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(pollTimerRef.current);
  }, [cameraReady, state, captureFrame]);

  // ── Countdown tick ─────────────────────────────────────────────────
  useEffect(() => {
    if (state !== STATES.COUNTDOWN) {
      clearInterval(countdownRef.current);
      return;
    }
    setCountdown(STABLE_HOLD_SEC);

    // During countdown, keep checking face is still there every 500ms
    let tick = STABLE_HOLD_SEC;
    countdownRef.current = setInterval(async () => {
      // Check face still present
      const blob = await captureFrame();
      if (!blob) { setState(STATES.SCANNING); return; }

      try {
        const fd = new FormData();
        fd.append('frame', blob, 'presence.jpg');
        const resp = await fetch(`${API}/detect-presence`, { method: 'POST', body: fd });
        const { face_detected } = await resp.json();

        if (!face_detected) {
          // Face gone — reset
          clearInterval(countdownRef.current);
          setCountdown(STABLE_HOLD_SEC);
          setState(STATES.SCANNING);
          return;
        }
      } catch { /* keep going */ }

      tick--;
      setCountdown(tick);
      if (tick <= 0) {
        clearInterval(countdownRef.current);
        runRecognition();
      }
    }, 1000);

    return () => clearInterval(countdownRef.current);
  }, [state, captureFrame, runRecognition]);

  // Cleanup result timer
  useEffect(() => () => clearTimeout(resultTimerRef.current), []);

  const isActive = state === STATES.COUNTDOWN || state === STATES.RECOGNIZING;

  return (
    <div className="attendance-page">
      {/* ── Camera Area ── */}
      <div className="camera-col">
        <div className="panel">
          <div className="panel-header">
            <span className="icon">📷</span>
            <span>Live Camera</span>
            <span className={`state-pill ${state}`}>{STATE_LABELS[state]}</span>
          </div>
          <div className="panel-body">
            <div className="video-wrapper">
              <video ref={videoRef} autoPlay playsInline muted />

              {/* Scanning laser line */}
              <div className={`scan-overlay ${isActive ? 'active' : ''}`}>
                <div className="scan-corners" />
              </div>

              {/* Countdown ring overlay */}
              {state === STATES.COUNTDOWN && (
                <div className="countdown-overlay">
                  <div className="countdown-ring">
                    <svg viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="54" className="ring-bg" />
                      <circle
                        cx="60" cy="60" r="54"
                        className="ring-fill"
                        strokeDasharray={`${(1 - countdown / STABLE_HOLD_SEC) * 339.3} 339.3`}
                      />
                    </svg>
                    <span className="countdown-num">{countdown}</span>
                  </div>
                  <p className="countdown-label">Hold Still…</p>
                </div>
              )}

              {/* Recognizing spinner */}
              {state === STATES.RECOGNIZING && (
                <div className="countdown-overlay">
                  <div className="spinner-large" />
                  <p className="countdown-label">Identifying…</p>
                </div>
              )}

              {/* Result popup */}
              {state === STATES.RESULT && result && (
                <div className={`result-overlay ${result.error ? 'error' : result.newly_marked ? 'success' : 'duplicate'}`}>
                  <div className="result-icon">
                    {result.error ? '⚠️' : result.newly_marked ? '✅' : 'ℹ️'}
                  </div>
                  {result.error ? (
                    <p className="result-name">{result.error}</p>
                  ) : (
                    <>
                      <p className="result-name">{result.name}</p>
                      <p className="result-sub">ID: {result.studentId}</p>
                      <p className="result-msg">{result.message}</p>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="scan-status-bar">
              {state === STATES.SCANNING && (
                <span className="pulse-text">🔍 Waiting for student… walk in front of the camera</span>
              )}
              {state === STATES.COUNTDOWN && (
                <span className="pulse-text indigo">✨ Face detected — hold still for {countdown}s</span>
              )}
              {state === STATES.RECOGNIZING && (
                <span className="pulse-text purple">🔄 Running identification…</span>
              )}
              {state === STATES.RESULT && (
                <span className="pulse-text">⏱ Resetting in {RESULT_DISPLAY_SEC}s…</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Sidebar ── */}
      <div className="sidebar-col">
        {/* Clock */}
        <div className="panel">
          <div className="panel-header"><span className="icon">📅</span> Session</div>
          <div className="panel-body">
            <p className="session-date">{formatDate(now)}</p>
            <p className="session-clock">{formatTime(now)}</p>
            <div className="session-info">
              <div className="stat-card">
                <div className="stat-value">{markedCount}</div>
                <div className="stat-label">Marked</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{log.length}</div>
                <div className="stat-label">Scans</div>
              </div>
            </div>
          </div>
        </div>

        {/* Attendance Log */}
        <div className="panel flex-panel">
          <div className="panel-header"><span className="icon">📋</span> Attendance Log</div>
          <div className="panel-body">
            <div className="log-list">
              {log.length === 0 ? (
                <p className="log-empty">No attendance recorded yet.<br />System is scanning automatically.</p>
              ) : (
                log.map((e, i) => (
                  <div key={i} className="log-item">
                    <div className="log-avatar">👤</div>
                    <div className="log-info">
                      <div className="log-id">{e.name}</div>
                      <div className="log-time">{e.studentId} · {formatTime(e.time)}</div>
                    </div>
                    <span className={`log-badge ${e.newly_marked ? 'new' : 'duplicate'}`}>
                      {e.newly_marked ? 'Marked' : 'Dup'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const STATE_LABELS = {
  [STATES.SCANNING]:    '🔍 Scanning',
  [STATES.COUNTDOWN]:   '⏳ Hold Still',
  [STATES.RECOGNIZING]: '🔄 Identifying',
  [STATES.RESULT]:      '✅ Done',
};
