import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiService } from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('cryptoai_access_token');
    const savedUsername = localStorage.getItem('cryptoai_username');
    
    if (savedToken && savedUsername) {
      verifyUserSession(savedUsername, savedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const verifyUserSession = async (username, token) => {
    try {
      const response = await apiService.getCurrentUser(username, token);
      if (response) {
        let preferences = null;
        
        try {
          preferences = await apiService.getUserPreferences(username, token);
          console.log('Loaded preferences from backend:', preferences);
        } catch (error) {
          console.log('No preferences found for user:', error.message);
        }
        const userData = {
          user_id: response.user_id,
          email: response.email,
          name: response.full_name,
          username: response.username,
          is_active: response.is_active,
          role: response.role || 'user',
          user_type: response.user_type || 'normal',
          preferences: preferences?.preferences || null
        };
        
        setUser(userData);
        setAccessToken(token);
        localStorage.setItem('cryptoai_username', username);
      }
    } catch (error) {
      console.error('Session verification failed:', error);
      setUser(null);
      setAccessToken(null);
      localStorage.removeItem('cryptoai_access_token');
      localStorage.removeItem('cryptoai_username');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password, influencerCode = "") => {
    try {
      const response = await apiService.login({ email, password, influencerCode });
      
      if (response.success) {
        let preferences = null;
        let hasPreferences = false;
        
        try {
          preferences = await apiService.getUserPreferences(response.user.username, response.access_token);
          console.log('Loaded preferences from backend (login):', preferences);
          hasPreferences = preferences.preferences !== null && preferences.preferences !== undefined;
        } catch (error) {
          console.log('No preferences found for user:', error.message);
          hasPreferences = false;
        }
        
        const userData = {
          user_id: response.user.user_id,
          email: response.user.email,
          name: response.user.full_name,
          username: response.user.username,
          is_active: response.user.is_active,
          role: response.user.role || 'user',
          user_type: response.user.user_type || 'normal',
          preferences: preferences?.preferences || null
        };
        
        setAccessToken(response.access_token);
        localStorage.setItem('cryptoai_access_token', response.access_token);
        localStorage.setItem('cryptoai_username', response.user.username);
        
        setUser(userData);
        return { 
          success: true, 
          message: response.message,
          hasPreferences: hasPreferences,
          role: response.user.role || 'user',
        };
      } else {
        return { success: false, message: response.message || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: error.message || 'An error occurred during login' };
    }
  };

  const sendOtp = async (email) => {
    try {
      const response = await apiService.sendOtp(email);
      return {
        success: response.success || response.ok,
        message: response.message || 'OTP sent',
        dev_otp: response.dev_otp,
      };
    } catch (error) {
      return { success: false, message: error.message || 'Failed to send OTP' };
    }
  };

  const sendSignupOtp = async (email) => {
    try {
      const response = await apiService.sendSignupOtp(email);
      return {
        success: response.success || response.ok,
        message: response.message || 'OTP sent',
        dev_otp: response.dev_otp,
      };
    } catch (error) {
      return { success: false, message: error.message || 'Failed to send OTP' };
    }
  };

  const verifySignupOtp = async (email, code) => {
    try {
      const response = await apiService.verifySignupOtp(email, code);
      return { success: true, message: response.message || 'Email verified' };
    } catch (error) {
      return { success: false, message: error.message || 'OTP verification failed' };
    }
  };

  const verifyOtpLogin = async (email, code) => {
    try {
      const verifyResp = await apiService.verifyOtp(email, code);
      const idpToken = verifyResp.idp_token;
      const exchangeResp = await apiService.exchangeOtp(idpToken);

      const userData = {
        user_id: exchangeResp.user.user_id,
        email: exchangeResp.user.email,
        name: exchangeResp.user.full_name,
        username: exchangeResp.user.username,
        is_active: exchangeResp.user.is_active,
        role: exchangeResp.user.role || 'user',
        user_type: exchangeResp.user.user_type || 'normal',
        preferences: null,
      };

      setAccessToken(exchangeResp.access_token);
      localStorage.setItem('cryptoai_access_token', exchangeResp.access_token);
      localStorage.setItem('cryptoai_username', exchangeResp.user.username);
      setUser(userData);

      return {
        success: true,
        message: exchangeResp.message,
        hasPreferences: false,
        role: exchangeResp.user.role || 'user',
      };
    } catch (error) {
      return { success: false, message: error.message || 'OTP login failed' };
    }
  };

  const signup = async (email, password, name, username, influencerCode = null) => {
    try {
      const response = await apiService.register({ email, password, name, username, influencerCode });
      
      if (response.success) {
        const userData = {
          user_id: response.user.user_id,
          email: response.user.email,
          name: response.user.full_name,
          username: response.user.username,
          is_active: response.user.is_active,
          role: response.user.role || 'user',
          user_type: response.user.user_type || 'normal',
          preferences: null
        };
        
        setAccessToken(response.access_token);
        localStorage.setItem('cryptoai_access_token', response.access_token);
        localStorage.setItem('cryptoai_username', response.user.username);
        
        setUser(userData);
        return { success: true, message: response.message };
      } else {
        return { success: false, message: response.message || 'Registration failed' };
      }
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, message: error.message || 'An error occurred during signup' };
    }
  };

  const updateUserPreferences = async (preferences) => {
    if (!user || !accessToken) {
      throw new Error('No user logged in or session expired');
    }

    try {
      console.log('Saving preferences:', preferences);
      await apiService.updateUserPreferences(user.username, preferences, accessToken);
      console.log('Preferences saved!');
      const updatedUser = {
        ...user,
        preferences
      };
      setUser(updatedUser);
      return { success: true, message: 'Preferences saved successfully!' };
    } catch (error) {
      console.error('Failed to update preferences:', error);
      return { success: false, message: 'Failed to save preferences.' };
    }
  };

  const logout = async () => {
    try {
      await apiService.logout(accessToken);
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setAccessToken(null);
      localStorage.removeItem('cryptoai_access_token');
      localStorage.removeItem('cryptoai_username');
    }
  };

  const value = {
    user,
    login,
    sendOtp,
    verifyOtpLogin,
    sendSignupOtp,
    verifySignupOtp,
    signup,
    logout,
    loading,
    updateUserPreferences,
    accessToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 
