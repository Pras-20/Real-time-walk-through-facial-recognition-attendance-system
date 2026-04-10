import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { 
  FilePieChart, 
  Download, 
  Search, 
  Users,
  AlertCircle
} from 'lucide-react';

export default function ReportsPage() {
  const { token } = useContext(AuthContext);
  const [classes, setClasses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('http://98.70.29.1/api/classes', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => setClasses(data));
  }, [token]);

  const fetchStats = async (courseName) => {
    if (!courseName) return;
    setLoading(true);
    try {
      const res = await fetch(`http://98.70.29.1/api/reports/courses/${encodeURIComponent(courseName)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setStats(data.stats || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = () => {
    if (stats.length === 0) return;
    
    const headers = ["Student Name", "Student ID", "Present Count", "Total Lectures", "Percentage"];
    const rows = stats.map(s => [
      s.name,
      s.student_id,
      s.present,
      s.total,
      `${s.percentage}%`
    ]);
    
    let csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Attendance_Report_${selectedCourse.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="reports-page p-4">
      <div className="panel mb-4">
        <div className="panel-header">
            <FilePieChart size={18} className="text-indigo-400" />
            Course Analytics & Cumulative Reports
        </div>
        <div className="panel-body">
          <div className="flex gap-4 items-end">
            <div className="form-group flex-1">
              <label>Select Course</label>
              <select 
                className="form-input"
                value={selectedCourse}
                onChange={(e) => {
                  setSelectedCourse(e.target.value);
                  fetchStats(e.target.value);
                }}
              >
                <option value="">-- Choose Course --</option>
                {[...new Set(classes.map(c => c.course_name))].map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <button 
              onClick={downloadCSV} 
              className="btn btn-secondary h-[46px] flex items-center gap-2"
              disabled={stats.length === 0}
            >
              <Download size={18} /> Download CSV
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-center py-8 text-slate-400">Analyzing attendance data...</p>
      ) : stats.length > 0 ? (
        <div className="panel">
          <div className="panel-header">
            <Users size={18} className="text-purple-400" />
            Performance Breakdown: {selectedCourse}
          </div>
          <div className="panel-body">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-bottom border-slate-700">
                  <th className="py-3 px-4 text-slate-400 text-xs font-bold uppercase">Student</th>
                  <th className="py-3 px-4 text-slate-400 text-xs font-bold uppercase">Lectures</th>
                  <th className="py-3 px-4 text-slate-400 text-xs font-bold uppercase">Attendance %</th>
                  <th className="py-3 px-4 text-slate-400 text-xs font-bold uppercase">Visual</th>
                </tr>
              </thead>
              <tbody>
                {stats.map(s => (
                  <tr key={s.student_id} className="border-bottom border-slate-800 hover:bg-slate-900/20">
                    <td className="py-4 px-4">
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-xs text-slate-500">{s.student_id}</div>
                    </td>
                    <td className="py-4 px-4">
                      {s.present} / {s.total}
                    </td>
                    <td className="py-4 px-4">
                      <span className={`font-bold ${s.percentage < 75 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {s.percentage}%
                      </span>
                    </td>
                    <td className="py-4 px-4 min-w-[150px]">
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${s.percentage < 75 ? 'bg-red-500' : 'bg-emerald-500'}`}
                          style={{ width: `${s.percentage}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : selectedCourse && (
        <div className="log-empty panel">
          <AlertCircle size={32} className="mb-2 text-slate-600" />
          No data available for this course.
        </div>
      )}
    </div>
  );
}
