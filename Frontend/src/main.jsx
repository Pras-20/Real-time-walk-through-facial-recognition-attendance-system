import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';
import { AuthProvider } from './context/AuthContext.jsx';
import { AttendanceProvider } from './context/AttendanceContext.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <AttendanceProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AttendanceProvider>
    </AuthProvider>
  </React.StrictMode>
);
