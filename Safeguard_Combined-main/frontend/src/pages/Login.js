import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Bitcoin, Eye, EyeOff, Mail, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';

const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    influencerCode: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [loginMode, setLoginMode] = useState('password');
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});

  const { login, sendOtp, verifyOtpLogin, logout } = useAuth();
  const navigate = useNavigate();
  const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  const validateForm = () => {
    const errors = {};
    if (!formData.email.trim()) errors.email = "Email can't be empty";
    else if (!emailRegex.test(formData.email)) errors.email = "Invalid email address";
    if (!formData.password) errors.password = "Password can't be empty";
    return errors;
  };

  const areAllFieldsFilled = () => {
    return (
      formData.email.trim() &&
      formData.password
    );
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
    setSuccess('');
    setFieldErrors({ ...fieldErrors, [e.target.name]: '' });
  };

  const handleBlur = (e) => {
    setTouched({ ...touched, [e.target.name]: true });
    const errors = validateForm();
    setFieldErrors(errors);
  };

  function stripStatusCodePrefix(msg) {
    return typeof msg === 'string' ? msg.replace(/^[0-9]{3}:\s*/, '') : msg;
  }

  const resolveCurrentRole = async (candidateRole) => {
    const direct = String(candidateRole || '').toLowerCase();
    if (direct) return direct;
    try {
      const username = localStorage.getItem('cryptoai_username');
      const token =
        localStorage.getItem('cryptoai_access_token') ||
        localStorage.getItem('access_token');
      if (!username || !token) return '';
      const me = await apiService.getCurrentUser(username, token);
      return String(me?.role || '').toLowerCase();
    } catch (_) {
      return '';
    }
  };

  const hasAdminAccess = async () => {
    try {
      const token =
        localStorage.getItem('cryptoai_access_token') ||
        localStorage.getItem('access_token');
      if (!token) return false;
      await apiService.makeRequest('/admin/users?limit=1&offset=0', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return true;
    } catch (_) {
      return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const errors = validateForm();
    setFieldErrors(errors);
    setTouched({ email: true, password: true });
    if (Object.keys(errors).length > 0) return;
    setLoading(true);
    try {
      const result = await login(
        formData.email,
        formData.password,
        isAdminLogin ? "" : formData.influencerCode
      );
      if (result.success) {
        const role = await resolveCurrentRole(result.role);
        if (isAdminLogin) {
          const isAdmin = role === 'admin' || (await hasAdminAccess());
          if (!isAdmin) {
            await logout();
            setError('This account is not an admin account.');
            return;
          }
          setSuccess('Admin login successful.');
          setTimeout(() => navigate('/admin'), 500);
          return;
        }
        setSuccess(result.message);
        setTimeout(() => {
          // Check if user has preferences, if not redirect to preferences page
          if (result.hasPreferences === false) {
            navigate('/preferences');
          } else {
            navigate('/dashboard');
          }
        }, 1000);
      } else {
        setError(stripStatusCodePrefix(result.message));
      }
    } catch (err) {
      setError(stripStatusCodePrefix(err.message || 'An error occurred during login. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async () => {
    setError('');
    setSuccess('');
    setDevOtp('');
    if (!formData.email.trim() || !emailRegex.test(formData.email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setOtpLoading(true);
    try {
      const result = await sendOtp(formData.email);
      if (result.success) {
        setSuccess(result.message || 'OTP sent.');
        if (isDev && result.dev_otp) {
          setDevOtp(result.dev_otp);
        }
      } else {
        setError(stripStatusCodePrefix(result.message));
      }
    } catch (err) {
      const msg = stripStatusCodePrefix(err.message || 'Failed to send OTP.');
      if (msg.includes('Email delivery unavailable')) {
        setError('Email delivery unavailable (SMTP blocked). Try Password Login or enable OTP_DEV_MODE.');
      } else {
        setError(msg);
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError('');
    setSuccess('');
    if (!formData.email.trim() || !emailRegex.test(formData.email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!otpCode.trim()) {
      setError('Please enter the OTP code.');
      return;
    }
    setOtpLoading(true);
    try {
      const result = await verifyOtpLogin(formData.email, otpCode.trim());
      if (result.success) {
        const role = await resolveCurrentRole(result.role);
        if (isAdminLogin) {
          const isAdmin = role === 'admin' || (await hasAdminAccess());
          if (!isAdmin) {
            await logout();
            setError('This account is not an admin account.');
            return;
          }
          setSuccess('Admin login successful.');
          setTimeout(() => navigate('/admin'), 500);
          return;
        }
        setSuccess(result.message || 'OTP login successful.');
        setTimeout(() => {
          if (result.hasPreferences === false) {
            navigate('/preferences');
          } else {
            navigate('/dashboard');
          }
        }, 800);
      } else {
        setError(stripStatusCodePrefix(result.message));
      }
    } catch (err) {
      setError(stripStatusCodePrefix(err.message || 'OTP login failed.'));
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="py-28 flex items-center justify-center relative overflow-hidden bg-background">
      {/* Animated Background Orbs */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <motion.div
          className="absolute w-[300px] h-[300px] rounded-full bg-gradient-to-br from-primary/30 to-purple-600/30 blur-3xl"
          animate={{
            y: [0, -20, 0],
            rotate: [0, 180, 0],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ top: '10%', right: '10%' }}
        />
        <motion.div
          className="absolute w-[200px] h-[200px] rounded-full bg-gradient-to-br from-purple-600/30 to-primary/30 blur-3xl"
          animate={{
            y: [0, -20, 0],
            rotate: [0, 180, 0],
          }}
          transition={{
            duration: 6,
            delay: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ bottom: '20%', left: '5%' }}
        />
        <motion.div
          className="absolute w-[150px] h-[150px] rounded-full bg-gradient-to-br from-primary/30 to-purple-600/30 blur-3xl"
          animate={{
            y: [0, -20, 0],
            rotate: [0, 180, 0],
          }}
          transition={{
            duration: 6,
            delay: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ top: '60%', right: '20%' }}
        />
      </div>

      <motion.div
        className="relative z-10 bg-card/80 backdrop-blur-xl border border-border rounded-3xl p-12 w-full max-w-md shadow-2xl"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="relative inline-block group">
            <motion.div
              className="flex items-center justify-center gap-3 text-3xl font-bold mb-6"
              onClick={() => {
                setIsAdminLogin((prev) => !prev);
                setError('');
                setSuccess('');
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsAdminLogin((prev) => !prev);
                  setError('');
                  setSuccess('');
                }
              }}
              style={{ cursor: 'pointer' }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Bitcoin className="h-10 w-10 text-primary drop-shadow-[0_0_10px_rgba(102,126,234,0.5)]" />
              <span className="bg-gradient-to-r from-[#667eea] to-[#764ba2] bg-clip-text text-transparent">
                Safe Guard
              </span>
            </motion.div>
            {!isAdminLogin ? (
              <button
                type="button"
                onClick={() => {
                  setIsAdminLogin((prev) => !prev);
                  setError('');
                  setSuccess('');
                }}
                className="absolute left-1/2 -translate-x-1/2 -top-3 px-3 py-1 rounded-md text-xs border transition-opacity opacity-0 group-hover:opacity-100 bg-card border-border text-foreground"
              >
                Admin
              </button>
            ) : null}
          </div>
          <h2 className="text-3xl font-bold text-foreground mb-2">
            {isAdminLogin ? 'Admin Login' : 'Welcome Back'}
          </h2>
          <p className="text-muted-foreground">Sign in to your account to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error Message */}
          {error && (
            <motion.div
              className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-destructive text-sm"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          {/* Success Message */}
          {success && (
            <motion.div
              className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-500 text-sm"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <span>{success}</span>
            </motion.div>
          )}

          {/* Email Input */}
          <div className="space-y-2">
            <div className="relative flex items-center">
              <Mail className="absolute left-4 h-5 w-5 text-muted-foreground z-10" />
              <input
                name="email"
                placeholder="Email address"
                value={formData.email}
                onChange={handleChange}
                onBlur={handleBlur}
                required
                className="w-full pl-12 pr-4 py-4 bg-background/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground backdrop-blur-sm transition-all focus:outline-none focus:border-primary focus:bg-background/80 focus:ring-4 focus:ring-primary/10"
              />
            </div>
            {touched.email && fieldErrors.email && (
              <p className="text-destructive text-sm flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Login Mode Toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLoginMode('password')}
              className={`py-3 rounded-xl border text-sm font-semibold transition-all ${
                loginMode === 'password'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background/50 text-foreground border-border hover:border-primary/60'
              }`}
            >
              Password Login
            </button>
            <button
              type="button"
              onClick={() => setLoginMode('otp')}
              className={`py-3 rounded-xl border text-sm font-semibold transition-all ${
                loginMode === 'otp'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background/50 text-foreground border-border hover:border-primary/60'
              }`}
            >
              Email Code Login
            </button>
          </div>
          
          {!isAdminLogin && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Influencer code (optional)
              </label>
              <input
                type="text"
                name="influencerCode"
                value={formData.influencerCode}
                onChange={handleChange}
                placeholder="e.g. Ursh-01"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl"
              />
            </div>
          )}
          

          {loginMode === 'password' && (
            <div className="space-y-2">
              <div className="relative flex items-center">
                <Lock className="absolute left-4 h-5 w-5 text-muted-foreground z-10" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  placeholder="Password"
                  value={formData.password}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  required
                  className="w-full pl-12 pr-12 py-4 bg-background/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground backdrop-blur-sm transition-all focus:outline-none focus:border-primary focus:bg-background/80 focus:ring-4 focus:ring-primary/10"
                />
                <button
                  type="button"
                  className="absolute right-4 text-muted-foreground hover:text-primary transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {touched.password && fieldErrors.password && (
                <p className="text-destructive text-sm flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {fieldErrors.password}
                </p>
              )}
            </div>
          )}

          {loginMode === 'otp' && (
            <div className="pt-2 border-t border-border/60 space-y-3">
              <p className="text-xs text-muted-foreground">Sign in with a one-time code</p>
              <div className="flex gap-2">
                <motion.button
                  type="button"
                  onClick={handleSendCode}
                  className="flex-1 py-3 bg-background/50 border border-border rounded-xl text-foreground font-medium hover:border-primary/60 transition-all disabled:opacity-60"
                  disabled={otpLoading || !formData.email.trim()}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  {otpLoading ? 'Sending...' : 'Send Code'}
                </motion.button>
                <input
                  name="otp"
                  placeholder="OTP code"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-40 px-3 py-3 bg-background/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground backdrop-blur-sm transition-all focus:outline-none focus:border-primary focus:bg-background/80 focus:ring-4 focus:ring-primary/10"
                />
              </div>
              {isDev && devOtp && (
                <div className="text-xs text-muted-foreground">
                  Dev OTP: <span className="font-mono text-foreground">{devOtp}</span>
                </div>
              )}
              <motion.button
                type="button"
                onClick={handleVerifyOtp}
                className="w-full py-3 bg-gradient-to-r from-primary/80 to-purple-600/80 text-primary-foreground font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-primary/30 disabled:opacity-60"
                disabled={otpLoading || !formData.email.trim() || !otpCode.trim()}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                {otpLoading ? 'Verifying...' : 'Verify & Login'}
              </motion.button>
            </div>
          )}

          {/* Submit Button */}
          {loginMode === 'password' && (
            <motion.button
              type="submit"
              className="w-full py-4 mt-4 bg-gradient-to-r from-primary to-purple-600 text-primary-foreground font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-primary/30 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-none"
              disabled={loading || !areAllFieldsFilled()}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </motion.button>
          )}
        </form>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-muted-foreground text-sm">
            Don't have an account?{' '}
            <Link to="/signup" className="text-primary font-semibold hover:text-primary/80 transition-colors">
              Sign up here
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login; 
