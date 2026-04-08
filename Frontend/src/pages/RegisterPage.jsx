import React, { useRef, useState, useCallback, useEffect } from 'react';

const API = 'http://127.0.0.1:8000';
const MAX_PHOTOS = 6;
const MIN_PHOTOS = 3;

export default function RegisterPage() {
  const videoRef      = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [photos, setPhotos]     = useState([]); // Array of { blob, url }
  const [form, setForm]         = useState({ student_id: '', name: '', course: '' });
  const [status, setStatus]     = useState(null); // { type: 'success'|'error'|'loading', msg }
  const [students, setStudents] = useState([]);
  const [trainingStatus, setTrainingStatus] = useState(null);

  // Load student list on mount
  useEffect(() => {
    fetch(`${API}/students`).then(r => r.json()).then(setStudents).catch(() => {});
    fetch(`${API}/training-status`).then(r => r.json()).then(setTrainingStatus).catch(() => {});
  }, []);

  // Start webcam
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      });
      videoRef.current.srcObject = stream;
      setCameraOn(true);
    } catch {
      alert('Camera access denied.');
    }
  };

  // Stop webcam
  const stopCamera = () => {
    videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
    videoRef.current && (videoRef.current.srcObject = null);
    setCameraOn(false);
  };

  // Snap a photo from the webcam
  const snapPhoto = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || photos.length >= MAX_PHOTOS) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    ctx.translate(c.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0);
    c.toBlob(blob => {
      setPhotos(prev => [...prev, { blob, url: URL.createObjectURL(blob) }]);
    }, 'image/jpeg', 0.9);
  }, [photos.length]);

  const removePhoto = (i) => {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const handleInput = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.student_id || !form.name) {
      setStatus({ type: 'error', msg: 'Student ID and Name are required.' });
      return;
    }
    if (photos.length < MIN_PHOTOS) {
      setStatus({ type: 'error', msg: `Please capture at least ${MIN_PHOTOS} photos.` });
      return;
    }

    setStatus({ type: 'loading', msg: 'Registering student with Azure Face API…' });

    const fd = new FormData();
    fd.append('student_id', form.student_id);
    fd.append('name', form.name);
    fd.append('course', form.course);
    photos.forEach((p, i) => fd.append('photos', p.blob, `photo${i}.jpg`));

    try {
      const resp = await fetch(`${API}/register`, { method: 'POST', body: fd });
      const data = await resp.json();
      if (resp.ok) {
        setStatus({ type: 'success', msg: data.message });
        setForm({ student_id: '', name: '', course: '' });
        photos.forEach(p => URL.revokeObjectURL(p.url));
        setPhotos([]);
        stopCamera();
        // Refresh list
        const updated = await fetch(`${API}/students`).then(r => r.json());
        setStudents(updated);
        const ts = await fetch(`${API}/training-status`).then(r => r.json());
        setTrainingStatus(ts);
      } else {
        setStatus({ type: 'error', msg: data.detail || 'Registration failed.' });
      }
    } catch {
      setStatus({ type: 'error', msg: 'Server connection failed.' });
    }
  };

  return (
    <div className="register-page">
      {/* ── Left: Form ── */}
      <div className="register-form-col">
        <div className="panel">
          <div className="panel-header"><span className="icon">➕</span> Register New Student</div>
          <div className="panel-body">
            <form className="reg-form" onSubmit={handleSubmit}>
              <div className="form-row">
                <label className="form-label">Student ID *</label>
                <input
                  className="form-input"
                  name="student_id"
                  value={form.student_id}
                  onChange={handleInput}
                  placeholder="e.g. CS2024001"
                  required
                />
              </div>
              <div className="form-row">
                <label className="form-label">Full Name *</label>
                <input
                  className="form-input"
                  name="name"
                  value={form.name}
                  onChange={handleInput}
                  placeholder="e.g. Prasanna Kumar"
                  required
                />
              </div>
              <div className="form-row">
                <label className="form-label">Course / Section</label>
                <input
                  className="form-input"
                  name="course"
                  value={form.course}
                  onChange={handleInput}
                  placeholder="e.g. B.E CSE – Section D"
                />
              </div>

              {/* Camera Section */}
              <div className="form-row">
                <label className="form-label">Face Photos ({photos.length}/{MAX_PHOTOS} — min {MIN_PHOTOS})</label>
                <div className="camera-capture-area">
                  <div className="video-wrapper reg-video">
                    <video ref={videoRef} autoPlay playsInline muted />
                    {!cameraOn && (
                      <div className="camera-placeholder">
                        <span>📷</span>
                        <p>Camera not started</p>
                      </div>
                    )}
                  </div>
                  <div className="camera-controls">
                    {!cameraOn ? (
                      <button type="button" className="btn btn-secondary" onClick={startCamera}>
                        📷 Start Camera
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={snapPhoto}
                          disabled={photos.length >= MAX_PHOTOS}
                        >
                          📸 Snap Photo
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={stopCamera}>
                          ✕ Stop
                        </button>
                      </>
                    )}
                    <p className="camera-hint">
                      Capture {MIN_PHOTOS}–{MAX_PHOTOS} clear, well-lit frontal photos.<br />
                      Slight angle variations improve accuracy.
                    </p>
                  </div>
                </div>
              </div>

              {/* Photo Thumbnails */}
              {photos.length > 0 && (
                <div className="photo-grid">
                  {photos.map((p, i) => (
                    <div key={i} className="photo-thumb">
                      <img src={p.url} alt={`photo ${i+1}`} />
                      <button type="button" className="remove-photo" onClick={() => removePhoto(i)}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Status */}
              {status && (
                <div className={`reg-status ${status.type}`}>
                  {status.type === 'loading' && <span className="spinner-sm" />}
                  {status.msg}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-submit"
                disabled={status?.type === 'loading'}
              >
                {status?.type === 'loading' ? (
                  <><span className="spinner-sm" /> Registering…</>
                ) : '✅ Register Student'}
              </button>
            </form>
          </div>
        </div>

        {/* Training Status */}
        {trainingStatus && (
          <div className={`training-banner ${trainingStatus.status}`}>
            <span>🧠 Face Model:</span>
            <strong>{trainingStatus.status === 'succeeded' ? '✅ Trained & Ready' : trainingStatus.status === 'running' ? '⏳ Training…' : `⚠️ ${trainingStatus.status}`}</strong>
          </div>
        )}
      </div>

      {/* ── Right: Student List ── */}
      <div className="students-col">
        <div className="panel" style={{ height: '100%' }}>
          <div className="panel-header">
            <span className="icon">👥</span>
            Registered Students ({students.length})
          </div>
          <div className="panel-body">
            <div className="student-list">
              {students.length === 0 ? (
                <p className="log-empty">No students registered yet.</p>
              ) : (
                students.map((s, i) => (
                  <div key={i} className="student-card">
                    <div className="student-avatar">{s.name[0].toUpperCase()}</div>
                    <div className="student-info">
                      <div className="student-name">{s.name}</div>
                      <div className="student-meta">{s.student_id} · {s.course || 'No course'}</div>
                      <div className="student-date">Registered: {s.registered_at?.slice(0, 10)}</div>
                    </div>
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
