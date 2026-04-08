import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import AttendancePage from './pages/AttendancePage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import './index.css';

export default function App() {
  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">🎓</div>
          <span className="logo-text">SmartAttend</span>
        </div>

        <nav className="app-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            📷 Live Attendance
          </NavLink>
          <NavLink
            to="/register"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            ➕ Register Student
          </NavLink>
        </nav>
      </header>

      <main className="app-main-content">
        <Routes>
          <Route path="/" element={<AttendancePage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </main>

      <footer className="app-footer">
        SmartAttend · Powered by Azure Face API · {new Date().getFullYear()}
      </footer>
    </div>
  );
}
