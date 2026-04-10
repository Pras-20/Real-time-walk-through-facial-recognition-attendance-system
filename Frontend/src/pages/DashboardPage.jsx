import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { 
  Users, 
  BookOpen, 
  Calendar, 
  CheckCircle, 
  TrendingUp,
  Clock
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

export default function DashboardPage() {
  const { token } = useContext(AuthContext);
  const [stats, setStats] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      try {
        const [statsRes, summaryRes] = await Promise.all([
          fetch('http://98.70.29.1/api/dashboard/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch('http://98.70.29.1/api/dashboard/summary', {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);

        if (statsRes.ok) setStats(await statsRes.json());
        if (summaryRes.ok) setSummary(await summaryRes.json());
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token]);

  if (loading) {
    return <div className="loading-screen">Preparing Analytics...</div>;
  }

  return (
    <div className="dashboard-page p-4">
      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="panel stat-panel">
          <div className="stat-icon-bg indigo">
            <Users size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Total Students</span>
            <span className="stat-number">{summary?.total_students || 0}</span>
          </div>
        </div>

        <div className="panel stat-panel">
          <div className="stat-icon-bg purple">
            <BookOpen size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Total Classes</span>
            <span className="stat-number">{summary?.total_classes || 0}</span>
          </div>
        </div>

        <div className="panel stat-panel">
          <div className="stat-icon-bg emerald">
            <Calendar size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Lectures Today</span>
            <span className="stat-number">{summary?.lectures_today || 0}</span>
          </div>
        </div>

        <div className="panel stat-panel">
          <div className="stat-icon-bg amber">
            <CheckCircle size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Present Today</span>
            <span className="stat-number">{summary?.present_today || 0}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* ── Attendance Trend ── */}
        <div className="panel col-span-2">
          <div className="panel-header">
            <TrendingUp size={18} className="mr-2 text-indigo-400" />
            Attendance Trend (Last 14 Days)
          </div>
          <div className="panel-body h-[350px]">
            {stats.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minHeight={0}>
                <AreaChart data={stats}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#c084fc" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#64748b" 
                    fontSize={12} 
                    tickFormatter={(val) => val.split('-').slice(1).join('/')}
                  />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      border: '1px solid #1e293b',
                      borderRadius: '8px'
                    }}
                    itemStyle={{ color: '#e2e8f0' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="count" 
                    stroke="#818cf8" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorCount)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500">
                Not enough data to display trend yet.
              </div>
            )}
          </div>
        </div>

        {/* ── System Health / Quick Info ── */}
        <div className="panel">
          <div className="panel-header">
            <Clock size={18} className="mr-2 text-purple-400" />
            Quick Overview
          </div>
          <div className="panel-body">
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">System Status</span>
                <span className="text-emerald-400 text-sm font-bold">Online</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-sm">Recognition AI</span>
                <span className="text-indigo-400 text-sm font-bold">Enhanced Mode</span>
              </div>
              <hr className="border-slate-800" />
              <div className="text-sm text-slate-400 leading-relaxed">
                Tip: Recognition accuracy is now enhanced for low-light environments. 
                Ensure students stand at least 0.5m from the camera.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
