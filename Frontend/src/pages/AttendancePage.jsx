import React, { useRef, useState, useEffect, useCallback, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { AttendanceContext } from '../context/AttendanceContext';
import { 
  Camera, 
  Search, 
  Clock, 
  Calendar, 
  ClipboardList, 
  UserCheck, 
  AlertCircle,
  Info,
  PlayCircle,
  StopCircle,
  Users
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL;
const POLL_INTERVAL_MS   = 800;    // Faster polling
const STABLE_HOLD_SEC    = 2;      // 2-second recognition target
const RESULT_DISPLAY_SEC = 3;      // Faster reset

const STATES = {
  IDLE:        'idle',       // Waiting to start lecture
  SCANNING:    'scanning',    // Looking for a face
  COUNTDOWN:   'countdown',   // Face found, checking stability
  RECOGNIZING: 'recognizing', // API call
  RESULT:      'result',      // Showing result
};

const STATE_LABELS = {
  [STATES.SCANNING]:    'Scanning',
  [STATES.COUNTDOWN]:   'Hold Still',
  [STATES.RECOGNIZING]: 'Checking',
  [STATES.RESULT]:      'Finished',
};

function formatTime(d) {
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function formatDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export default function AttendancePage() {
  const { token, user } = useContext(AuthContext);
  const { logs, addLog, activeLecture, setActiveLecture } = useContext(AttendanceContext);

  const videoRef = useRef(null);
  const pollTimerRef = useRef(null);
  const countdownRef = useRef(null);
  const resultTimerRef = useRef(null);

  const [state, setState] = useState(activeLecture ? STATES.SCANNING : STATES.IDLE);
  const [countdown, setCountdown] = useState(STABLE_HOLD_SEC);
  const [result, setResult] = useState(null);
  const [cameraReady, setReady] = useState(false);
  const [now, setNow] = useState(new Date());
  
  // Dashboard states
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [lightingError, setLightingError] = useState(null);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch classes if not in a lecture
  useEffect(() => {
    if (state === STATES.IDLE && token) {
      setLoadingClasses(true);
      fetch(`${API}/api/classes`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => setClasses(data))
      .catch(err => console.error("Err fetching classes", err))
      .finally(() => setLoadingClasses(false));
    }
  }, [state, token]);

  const startCamera = useCallback(async () => {
    setLightingError(null);
    let stream;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API not supported or not in a secure context (HTTPS/Localhost).');
      }
      
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setReady(true);
      }
      return stream;
    } catch (err) {
      console.error("Camera Error:", err);
      let msg = "Camera access denied.";
      if (err.name === 'NotAllowedError') msg = "Camera permission denied by browser.";
      if (err.name === 'NotFoundError') msg = "No camera hardware found.";
      if (err.name === 'NotReadableError') msg = "Camera is already in use by another app (e.g., Zoom, Teams).";
      if (!window.isSecureContext) msg += " (Note: Site is not in a Secure Context).";
      
      setLightingError(`Hardware Error: ${msg}`);
      return null;
    }
  }, []);

  // Webcam setup
  useEffect(() => {
    if (state === STATES.IDLE) return;
    
    let streamObj;
    startCamera().then(s => streamObj = s);
    
    return () => { 
      if (streamObj) {
        streamObj.getTracks().forEach(t => t.stop());
      }
    };
  }, [state, startCamera]);

  // Luminance check for Bad Lighting
  const checkLighting = useCallback((ctx, width, height) => {
    const data = ctx.getImageData(0, 0, width, height).data;
    let colorSum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i+1] + data[i+2]) / 3;
      colorSum += avg;
    }
    const brightness = colorSum / (width * height);
    // Log brightness for diagnostics but never block
    if (brightness < 5) console.warn("Extremely low light detected:", brightness);
    return "OK";
  }, []);

  const captureFrame = useCallback(() => new Promise(resolve => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return resolve(null);
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    ctx.translate(c.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0);
    
    // Quick lighting check (internal only, doesn't block capture)
    checkLighting(ctx, c.width, c.height);
    setLightingError(null);
    
    c.toBlob(resolve, 'image/jpeg', 0.85);
  }), [checkLighting]);

  const handleStartLecture = async () => {
    if (!selectedClassId) return;
    const cls = classes.find(c => c.id === parseInt(selectedClassId));
    
    try {
        const res = await fetch(`${API}/api/lectures/start`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                class_id: cls.id,
                date: new Date().toISOString().split('T')[0],
                time: new Date().toTimeString().split(' ')[0]
            })
        });
        const data = await res.json();
        if (res.ok) {
            setActiveLecture({ ...cls, lecture_id: data.lecture_id });
            setState(STATES.SCANNING);
        }
    } catch (err) {
        alert("Failed to start lecture session.");
    }
  };

  const handleEndLecture = async () => {
    if (!activeLecture) return;
    await fetch(`${API}/api/lectures/${activeLecture.lecture_id}/end`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    setActiveLecture(null);
    setState(STATES.IDLE);
    setReady(false);
  };

  const runRecognition = useCallback(async () => {
    setState(STATES.RECOGNIZING);
    try {
      const fd = new FormData();
      fd.append('lecture_id', activeLecture.lecture_id);
      
      // Capture 5 frames over ~1sec for increased reliability
      let framesCount = 0;
      for (let i = 0; i < 5; i++) {
          const blob = await captureFrame();
          if (blob) {
              fd.append('frames', blob, `frame${i}.jpg`);
              framesCount++;
          }
          await new Promise(r => setTimeout(r, 150));
      }

      if (framesCount === 0) {
          setState(STATES.SCANNING);
          return;
      }

      const resp = await fetch(`${API}/api/recognize`, { method: 'POST', body: fd });
      const data = await resp.json();

      if (resp.ok && data.status === 'success') {
        const entry = {
          name: data.name,
          studentId: data.studentId,
          newly_marked: data.newly_marked,
          time: new Date().toISOString(),
          status: data.newly_marked ? 'Marked' : 'Duplicate'
        };
        setResult({ ...entry, message: data.message });
        addLog(entry);
      } else {
        setResult({ error: data.detail || 'Access Denied.' });
      }
    } catch (err) {
      setResult({ error: 'Server connection dropped.' });
    }

    setState(STATES.RESULT);

    resultTimerRef.current = setTimeout(() => {
      setResult(null);
      setCountdown(STABLE_HOLD_SEC);
      setState(STATES.SCANNING);
    }, RESULT_DISPLAY_SEC * 1000);
  }, [captureFrame, activeLecture, addLog]);

  // Polling loop
  useEffect(() => {
    if (!cameraReady || state !== STATES.SCANNING) return;

    const poll = async () => {
      const blob = await captureFrame();
      if (!blob) return;

      try {
        const fd = new FormData();
        fd.append('frame', blob, 'presence.jpg');
        const resp = await fetch(`${API}/api/detect-presence`, { method: 'POST', body: fd });
        const { face_detected } = await resp.json();

        if (face_detected) setState(STATES.COUNTDOWN);
      } catch { /* ignore */ }
    };

    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(pollTimerRef.current);
  }, [cameraReady, state, captureFrame]);

  // Countdown tick
  useEffect(() => {
    if (state !== STATES.COUNTDOWN) return;
    
    setCountdown(STABLE_HOLD_SEC);
    let tick = STABLE_HOLD_SEC;
    
    countdownRef.current = setInterval(async () => {
      const blob = await captureFrame();
      if (!blob) { setState(STATES.SCANNING); return; }

      tick--;
      setCountdown(tick);
      if (tick <= 0) {
        clearInterval(countdownRef.current);
        runRecognition();
      }
    }, 1000);

    return () => clearInterval(countdownRef.current);
  }, [state, captureFrame, runRecognition]);

  if (state === STATES.IDLE) {
      return (
          <div className="attendance-setup-page">
              <div className="auth-card">
                  <h2>Start New Session</h2>
                  <p className="auth-subtitle">Choose a class to begin taking attendance</p>
                  
                  {loadingClasses ? (
                      <p className="text-center py-4">Fetching your classes...</p>
                  ) : classes.length === 0 ? (
                      <div className="text-center">
                          <p className="text-muted mb-4">You haven't added any classes to your schedule yet.</p>
                          <button onClick={() => window.location.hash = '/schedule'} className="btn btn-secondary w-full">Go to Schedule</button>
                      </div>
                  ) : (
                      <div className="auth-form">
                          <div className="form-group">
                              <label>Select Class</label>
                              <select 
                                className="form-input"
                                value={selectedClassId}
                                onChange={(e) => setSelectedClassId(e.target.value)}
                              >
                                  <option value="">-- Choose Course --</option>
                                  {classes.map(c => (
                                      <option key={c.id} value={c.id}>{c.course_name} ({c.schedule_info})</option>
                                  ))}
                              </select>
                          </div>
                          <button 
                            onClick={handleStartLecture} 
                            disabled={!selectedClassId}
                            className="btn btn-primary btn-submit"
                          >
                            <PlayCircle size={20} />
                            Start Attendance Session
                          </button>
                      </div>
                  )}
              </div>
          </div>
      );
  }

  return (
    <div className="attendance-page">
      <div className="camera-col">
        <div className="panel">
          <div className="panel-header">
            <Camera size={20} className="text-indigo-400" />
            <div className="flex-1">
                <strong>{activeLecture?.course_name}</strong>
                <span className="text-muted ml-2">Live Session</span>
            </div>
            <span className={`state-pill ${state}`}>{STATE_LABELS[state]}</span>
          </div>
          <div className="panel-body">
            {lightingError && (
                <div className="lighting-warning">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={18} /> {lightingError}
                    </div>
                    <button 
                        onClick={() => startCamera()} 
                        className="btn btn-primary btn-sm mt-2"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                    >
                        Retry Camera
                    </button>
                </div>
            )}
            <div className={`video-wrapper ${state === STATES.SCANNING ? 'scanning-glow' : ''} ${lightingError ? 'dimmed' : ''}`}>
              <video ref={videoRef} autoPlay playsInline muted />

              <div className={`scan-overlay ${state === STATES.COUNTDOWN || state === STATES.RECOGNIZING ? 'active' : ''}`}>
                <div className="scan-corners" />
              </div>

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

              {state === STATES.RECOGNIZING && (
                <div className="countdown-overlay">
                  <div className="spinner-large" />
                  <p className="countdown-label">Analyzing…</p>
                </div>
              )}

              {state === STATES.RESULT && result && (
                <div className={`result-overlay ${result.error ? 'error' : result.newly_marked ? 'success' : 'duplicate'}`}>
                  <div className="result-icon">
                    {result.error ? <AlertCircle size={48} /> : result.newly_marked ? <UserCheck size={48} /> : <Info size={48} />}
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
                <span className="pulse-text"><Search size={16} /> Waiting for student…</span>
              )}
              {state === STATES.COUNTDOWN && (
                <span className="pulse-text indigo">✨ Verifying face… stay still</span>
              )}
              {state === STATES.RESULT && (
                <span className="pulse-text"><Clock size={16} /> Ready again in {countdown}s…</span>
              )}
            </div>
          </div>
        </div>
        
        <button onClick={handleEndLecture} className="btn btn-ghost mt-4">
            <StopCircle size={20} />
            Finish Lecture and Close Camera
        </button>
      </div>

      <div className="sidebar-col">
        <div className="panel">
          <div className="panel-header"><Calendar size={18} className="text-purple-400" /> Current Session</div>
          <div className="panel-body">
            <p className="session-date">{formatDate(now)}</p>
            <p className="session-clock">{formatTime(now)}</p>
            <div className="session-info">
              <div className="stat-card">
                <div className="stat-value">{logs.filter(l => l.newly_marked).length}</div>
                <div className="stat-label">Present</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{logs.length}</div>
                <div className="stat-label">Total Logs</div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel flex-panel">
          <div className="panel-header"><ClipboardList size={18} className="text-indigo-400" /> Live Attendance Log</div>
          <div className="panel-body">
            <div className="log-list">
              {logs.length === 0 ? (
                <p className="log-empty">No activity yet.<br />Logs will persist if you switch tabs.</p>
              ) : (
                logs.map((e, i) => (
                  <div key={i} className="log-item">
                    <div className="log-avatar">{e.name.charAt(0)}</div>
                    <div className="log-info">
                      <div className="log-id">{e.name}</div>
                      <div className="log-time">{e.studentId} · {formatTime(e.time)}</div>
                    </div>
                    <span className={`log-badge ${e.newly_marked ? 'new' : 'duplicate'}`}>
                      {e.status}
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
