import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        // background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
        color: '#ffffff'
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check if user is trying to access dashboard but hasn't completed preferences
  if (location.pathname === '/dashboard' && (!user.preferences || !user.preferences.completed)) {
    return <Navigate to="/preferences" replace />;
  }

  return children;
};

export default ProtectedRoute; 