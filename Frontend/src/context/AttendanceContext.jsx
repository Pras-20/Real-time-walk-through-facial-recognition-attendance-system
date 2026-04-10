import React, { createContext, useState } from 'react';

export const AttendanceContext = createContext();

export function AttendanceProvider({ children }) {
    // Stores logs for the UI so they persist between tab switches
    const [logs, setLogs] = useState([]);
    
    // Active lecture state: {id, course_name, professor_id, ...}
    const [activeLecture, setActiveLecture] = useState(null);

    const addLog = (newLog) => {
        setLogs(prev => [newLog, ...prev]);
    };

    const clearLogs = () => {
        setLogs([]);
    };

    return (
        <AttendanceContext.Provider value={{
            logs, addLog, clearLogs,
            activeLecture, setActiveLecture
        }}>
            {children}
        </AttendanceContext.Provider>
    );
}
