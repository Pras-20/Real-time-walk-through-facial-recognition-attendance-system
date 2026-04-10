import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { 
  ClipboardCheck, 
  Search, 
  Filter, 
  UserCheck, 
  UserX,
  Clock
} from 'lucide-react';

export default function ManageAttendancePage() {
  const { token } = useContext(AuthContext);
  const [classes, setClasses] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedLectureId, setSelectedLectureId] = useState('');
  const [report, setReport] = useState([]);
  const [loadingLectures, setLoadingLectures] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);

  // Fetch classes on mount
  useEffect(() => {
    fetch('http://98.70.29.1/api/classes', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => setClasses(data));
  }, [token]);

  // Fetch lectures when class changes
  useEffect(() => {
    if (selectedClassId) {
      setLoadingLectures(true);
      setLectures([]);
      setSelectedLectureId('');
      setReport([]);
      
      fetch(`http://98.70.29.1/api/classes/${selectedClassId}/lectures`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => setLectures(data))
      .catch(() => {})
      .finally(() => setLoadingLectures(false));
    }
  }, [selectedClassId, token]);

  // Fetch report when lecture changes
  const fetchReport = async (lId) => {
    if (!lId) return;
    setLoadingReport(true);
    try {
      const res = await fetch(`http://98.70.29.1/api/reports/lectures/${lId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setReport(data.report || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    if (selectedLectureId) {
        fetchReport(selectedLectureId);
    }
  }, [selectedLectureId]);

  const toggleAttendance = async (personId, currentStatus) => {
    try {
      const res = await fetch('http://98.70.29.1/api/attendance/manual', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          person_id: personId,
          lecture_id: parseInt(selectedLectureId),
          present: !currentStatus
        })
      });
      if (res.ok) {
        fetchReport(selectedLectureId);
      }
    } catch (err) {
      alert("Failed to update attendance.");
    }
  };

  return (
    <div className="manage-page p-4">
      <div className="panel mb-4">
        <div className="panel-header">
            <Filter size={18} className="text-indigo-400" />
            Attendance Correction & Override
        </div>
        <div className="panel-body">
          <div className="flex gap-4 items-end">
            <div className="form-group flex-1">
              <label>1. Select Class</label>
              <select 
                className="form-input"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
              >
                <option value="">-- Choose Class --</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.course_name}</option>)}
              </select>
            </div>
            <div className="form-group flex-1">
              <label>2. Select Session (Date/Time)</label>
              <select 
                className="form-input"
                value={selectedLectureId}
                onChange={(e) => setSelectedLectureId(e.target.value)}
                disabled={!selectedClassId || loadingLectures}
              >
                <option value="">{loadingLectures ? 'Loading sessions...' : '-- Choose Session --'}</option>
                {lectures.map(l => (
                    <option key={l.id} value={l.id}>
                        {l.date} @ {l.start_time.slice(0, 5)}
                    </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {loadingReport ? (
        <p className="text-center py-8 text-slate-400">Loading attendance data...</p>
      ) : report.length > 0 ? (
        <div className="panel">
          <div className="panel-header">
            <ClipboardCheck size={18} className="text-emerald-400" />
            Attendance for session: {lectures.find(l => l.id == selectedLectureId)?.date}
          </div>
          <div className="panel-body">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-bottom border-slate-700">
                  <th className="py-3 px-4 text-slate-400 text-xs font-bold uppercase">Student Name</th>
                  <th className="py-3 px-4 text-slate-400 text-xs font-bold uppercase">Student ID</th>
                  <th className="py-3 px-4 text-slate-400 text-xs font-bold uppercase">Status</th>
                  <th className="py-3 px-4 text-slate-400 text-xs font-bold uppercase">Action</th>
                </tr>
              </thead>
              <tbody>
                {report.map(s => (
                  <tr key={s.person_id} className="border-bottom border-slate-800 hover:bg-slate-900/40">
                    <td className="py-4 px-4 font-semibold">{s.name}</td>
                    <td className="py-4 px-4 text-slate-400">{s.student_id}</td>
                    <td className="py-4 px-4">
                      <span className={`log-badge ${s.present ? 'new' : 'duplicate'}`}>
                        {s.present ? 'Present' : 'Absent'}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <button 
                        onClick={() => toggleAttendance(s.person_id, s.present)}
                        className={`btn ${s.present ? 'btn-ghost' : 'btn-secondary'} py-1 px-3 text-xs flex items-center gap-2`}
                      >
                        {s.present ? <><UserX size={14} /> Mark Absent</> : <><UserCheck size={14} /> Mark Present</>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : selectedLectureId ? (
        <div className="log-empty panel">
          <Search size={32} className="mb-2 text-slate-600" />
          No students found enrolled in this course.
        </div>
      ) : selectedClassId && lectures.length === 0 && !loadingLectures ? (
        <div className="log-empty panel">
          <Clock size={32} className="mb-2 text-slate-600" />
          No lecture sessions have been started for this class yet.
        </div>
      ) : null}
    </div>
  );
}
