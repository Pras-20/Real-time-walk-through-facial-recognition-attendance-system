import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { 
  PlusCircle, 
  CalendarDays, 
  BookOpen, 
  Clock,
  Layout
} from 'lucide-react';

export default function SchedulePage() {
  const [courseName, setCourseName] = useState('');
  const [day, setDay] = useState('Monday');
  const [time, setTime] = useState('09:00');
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  const { token } = useContext(AuthContext);

  const fetchClasses = async () => {
    try {
      const res = await fetch('http://98.70.29.1/api/classes', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setClasses(data);
      }
    } catch (err) {
      console.error("Failed to fetch classes", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage({ type: '', text: '' });
    
    const formattedSchedule = `${day}, ${time}`;
    
    try {
      const res = await fetch('http://98.70.29.1/api/classes', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ course_name: courseName, schedule_info: formattedSchedule })
      });
      
      if (res.ok) {
        setMessage({ type: 'success', text: 'Class added to your schedule!' });
        setCourseName('');
        setDay('Monday');
        setTime('09:00');
        fetchClasses();
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.detail || 'Failed to add class' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Connection error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="schedule-page layout-2col">
      <div className="panel flex-panel">
        <div className="panel-header">
          <PlusCircle size={18} className="text-indigo-400" /> 
          Add New Class
        </div>
        <div className="panel-body">
          <form onSubmit={handleSubmit} className="reg-form">
            <div className="form-row">
              <label className="form-label">Course Name</label>
              <input 
                className="form-input"
                type="text" 
                value={courseName} 
                onChange={(e) => setCourseName(e.target.value)} 
                placeholder="e.g. Data Structures CS201"
                required 
              />
            </div>
            <div className="form-row">
              <label className="form-label">Day of Week</label>
              <div className="relative">
                <select 
                    className="form-input"
                    value={day} 
                    onChange={(e) => setDay(e.target.value)}
                    required 
                >
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                    <option value="Sunday">Sunday</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <label className="form-label">Start Time</label>
              <input 
                className="form-input"
                type="time" 
                value={time} 
                onChange={(e) => setTime(e.target.value)} 
                required 
              />
            </div>
            
            {message.text && (
              <div className={`reg-status ${message.type}`}>
                {message.text}
              </div>
            )}
            
            <button type="submit" className="btn btn-primary btn-submit" disabled={submitting}>
              {submitting ? 'Adding...' : <><CalendarDays size={20} /> Add to Schedule</>}
            </button>
          </form>
        </div>
      </div>

      <div className="panel flex-panel sidebar-col">
        <div className="panel-header">
          <BookOpen size={18} className="text-purple-400" /> 
          My Enrolled Courses
        </div>
        <div className="panel-body">
          {loading ? (
            <p className="text-muted">Loading your schedule...</p>
          ) : classes.length === 0 ? (
            <div className="log-empty">
              No classes added yet.<br/>
              Create your first class to start taking attendance.
            </div>
          ) : (
            <div className="student-list">
              {classes.map(cls => (
                <div key={cls.id} className="student-card">
                  <div className="student-avatar">
                    <Layout size={16} />
                  </div>
                  <div className="student-info">
                    <div className="student-name">{cls.course_name}</div>
                    <div className="student-meta">
                        <Clock size={12} className="inline mr-1" />
                        {cls.schedule_info}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
