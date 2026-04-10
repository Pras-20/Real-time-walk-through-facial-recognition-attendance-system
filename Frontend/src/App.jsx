import React, { useContext } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { AuthContext } from './context/AuthContext.jsx';
import { 
  LayoutDashboard, 
  Camera, 
  UserPlus, 
  CalendarDays, 
  ClipboardCheck, 
  FilePieChart,
  LogOut,
  User,
  GraduationCap
} from 'lucide-react';

import DashboardPage from './pages/DashboardPage.jsx';
import AttendancePage from './pages/AttendancePage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ProfessorRegisterPage from './pages/ProfessorRegisterPage.jsx';
import SchedulePage from './pages/SchedulePage.jsx';
import ManageAttendancePage from './pages/ManageAttendancePage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import './index.css';

export default function App() {
  const { user, loading, logout } = useContext(AuthContext);

  if (loading) return <div className="loading-screen">Authenticating Session...</div>;

  return (
    <div className="app-shell">
      {user && (
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="logo-icon">
              <GraduationCap size={24} color="#818cf8" />
            </div>
            <span className="logo-text">SmartAttend</span>
          </div>
          
          <nav className="nav-group">
            <NavLink to="/" end className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <LayoutDashboard size={20} />
              <span>Dashboard</span>
            </NavLink>
            <NavLink to="/attendance" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <Camera size={20} />
              <span>Live Capture</span>
            </NavLink>
            <NavLink to="/register-student" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <UserPlus size={20} />
              <span>Enroll Pupil</span>
            </NavLink>
            <NavLink to="/schedule" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <CalendarDays size={20} />
              <span>My Schedule</span>
            </NavLink>
            <NavLink to="/manage" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <ClipboardCheck size={20} />
              <span>Correction</span>
            </NavLink>
            <NavLink to="/reports" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
              <FilePieChart size={20} />
              <span>Analytics</span>
            </NavLink>
          </nav>

          <div className="sidebar-footer">
            <div className="user-profile">
              <div className="user-avatar-small"><User size={16} /></div>
              <div className="user-info-mini">
                <span className="user-name-mini">{user.name}</span>
              </div>
              <button onClick={logout} className="logout-icon-btn" title="Logout">
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </aside>
      )}

      <main className="main-content">
        <Routes>
          <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />
          <Route path="/register" element={!user ? <ProfessorRegisterPage /> : <Navigate to="/" />} />
          
          <Route path="/" element={user ? <DashboardPage /> : <Navigate to="/login" />} />
          <Route path="/attendance" element={user ? <AttendancePage /> : <Navigate to="/login" />} />
          <Route path="/register-student" element={user ? <RegisterPage /> : <Navigate to="/login" />} />
          <Route path="/schedule" element={user ? <SchedulePage /> : <Navigate to="/login" />} />
          <Route path="/manage" element={user ? <ManageAttendancePage /> : <Navigate to="/login" />} />
          <Route path="/reports" element={user ? <ReportsPage /> : <Navigate to="/login" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
