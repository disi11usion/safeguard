import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Bitcoin, Eye, EyeOff, Mail, Lock, User, IdCard, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const Signup = () => {
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    influencerCode: '',
    password: '',
    confirmPassword: '',
    influencerCode: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [devOtp, setDevOtp] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const { signup, sendSignupOtp, verifySignupOtp } = useAuth();
  const navigate = useNavigate();
  const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = "Full name can't be empty";
    if (!formData.username.trim()) errors.username = "Username can't be empty";
    if (!formData.email.trim()) errors.email = "Email can't be empty";
    else if (!emailRegex.test(formData.email)) errors.email = "Invalid email address";
    if (!formData.password) errors.password = "Password can't be empty";
    else if (formData.password.length < 6) errors.password = "Password must be at least 6 characters long";
    if (!formData.confirmPassword) errors.confirmPassword = "Confirm password can't be empty";
    else if (formData.password !== formData.confirmPassword) errors.confirmPassword = "Passwords do not match";
    if (formData.username && formData.username.length < 3) errors.username = 'Username must be at least 3 characters long';
    if (formData.username && !/^[a-zA-Z0-9_]+$/.test(formData.username)) errors.username = 'Username can only contain letters, numbers, and underscores';
    return errors;
  };



  const handleChange = (e) => {
    if (e.target.name === 'email') {
      setOtpCode('');
      setOtpSent(false);
      setOtpVerified(false);
    }
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
    setSuccess('');
    setFieldErrors({ ...fieldErrors, [e.target.name]: '' });
  };

  function stripStatusCodePrefix(msg) {
    return typeof msg === 'string' ? msg.replace(/^[0-9]{3}:\s*/, '') : msg;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!otpVerified) {
      setError('Please verify your email with the code before signing up.');
      return;
    }
    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setLoading(true);
    try {
      const result = await signup(
        formData.email,
        formData.password,
        formData.name,
        formData.username,
        formData.influencerCode
      );
      if (result.success) {
        setSuccess(result.message);
        setTimeout(() => {
          navigate('/dashboard');
        }, 1000);
      } else {
        setError(stripStatusCodePrefix(result.message));
      }
    } catch (err) {
      setError(stripStatusCodePrefix(err.message || 'An error occurred during signup. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const areAllFieldsFilled = () => {
    return (
      formData.name.trim() &&
      formData.username.trim() &&
      formData.email.trim() &&
      formData.password &&
      formData.confirmPassword &&
      otpVerified
    );
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
      const result = await sendSignupOtp(formData.email);
      if (result.success) {
        setOtpSent(true);
        setSuccess(result.message || 'Verification code sent.');
        if (isDev && result.dev_otp) {
          setDevOtp(result.dev_otp);
        }
      } else {
        setError(stripStatusCodePrefix(result.message));
      }
    } catch (err) {
      const msg = stripStatusCodePrefix(err.message || 'Failed to send verification code.');
      if (msg.includes('Email delivery unavailable')) {
        setError('Email delivery unavailable (SMTP blocked). Try Password Login or enable OTP_DEV_MODE.');
      } else {
        setError(msg);
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (otpLoading || otpVerified) return;
    setError('');
    setSuccess('');
    if (!otpSent) {
      setError('Please send a verification code first.');
      return;
    }
    if (!formData.email.trim() || !emailRegex.test(formData.email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!otpCode.trim()) {
      setError('Please enter the verification code.');
      return;
    }
    setOtpLoading(true);
    try {
      const result = await verifySignupOtp(formData.email, otpCode.trim());
      if (result.success) {
        setOtpVerified(true);
        setSuccess(result.message || 'Email verified.');
      } else {
        setError(stripStatusCodePrefix(result.message));
      }
    } catch (err) {
      setError(stripStatusCodePrefix(err.message || 'Verification failed.'));
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="py-28 flex items-center justify-center relative overflow-hidden bg-background pt-12 pb-12">
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
          <motion.div
            className="flex items-center justify-center gap-3 text-3xl font-bold mb-6"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Bitcoin className="h-10 w-10 text-primary drop-shadow-[0_0_10px_rgba(102,126,234,0.5)]" />
            <span className="bg-gradient-to-r from-[#667eea] to-[#764ba2] bg-clip-text text-transparent">
              Safe Guard
            </span>
          </motion.div>
          <h2 className="text-3xl font-bold text-foreground mb-2">Create Account</h2>
          <p className="text-muted-foreground">Join Safe Guard and start your trading journey</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
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

          {/* Full Name Input */}
          <div className="space-y-2">
            <div className="relative flex items-center">
              <User className="absolute left-4 h-5 w-5 text-muted-foreground z-10" />
              <input
                type="text"
                name="name"
                placeholder="Full name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full pl-12 pr-4 py-4 bg-background/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground backdrop-blur-sm transition-all focus:outline-none focus:border-primary focus:bg-background/80 focus:ring-4 focus:ring-primary/10"
              />
            </div>
            {fieldErrors.name && (
              <p className="text-destructive text-sm flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {fieldErrors.name}
              </p>
            )}
          </div>

          {/* Username Input */}
          <div className="space-y-2">
            <div className="relative flex items-center">
              <IdCard className="absolute left-4 h-5 w-5 text-muted-foreground z-10" />
              <input
                type="text"
                name="username"
                placeholder="Username (e.g., john_doe123)"
                value={formData.username}
                onChange={handleChange}
                required
                className="w-full pl-12 pr-4 py-4 bg-background/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground backdrop-blur-sm transition-all focus:outline-none focus:border-primary focus:bg-background/80 focus:ring-4 focus:ring-primary/10"
              />
            </div>
            {fieldErrors.username && (
              <p className="text-destructive text-sm flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {fieldErrors.username}
              </p>
            )}
          </div>

          {/* Email Input */}
          <div className="space-y-2">
            <div className="relative flex items-center">
              <Mail className="absolute left-4 h-5 w-5 text-muted-foreground z-10" />
              <input
                name="email"
                placeholder="Email address"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full pl-12 pr-4 py-4 bg-background/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground backdrop-blur-sm transition-all focus:outline-none focus:border-primary focus:bg-background/80 focus:ring-4 focus:ring-primary/10"
              />
            </div>
            {fieldErrors.email && (
              <p className="text-destructive text-sm flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {fieldErrors.email}
              </p>
            )}
          </div>

          {/* Influencer Code Input */}
          <div className="space-y-2">
            <div className="relative flex items-center">
              <IdCard className="absolute left-4 h-5 w-5 text-muted-foreground z-10" />
              <input
                type="text"
                name="influencerCode"
                placeholder="Influencer code (optional)"
                value={formData.influencerCode}
                onChange={handleChange}
                className="w-full pl-12 pr-4 py-4 bg-background/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground backdrop-blur-sm transition-all focus:outline-none focus:border-primary focus:bg-background/80 focus:ring-4 focus:ring-primary/10"
              />
            </div>
          </div>

          {/* Email Verification */}
          <div className="pt-2 border-t border-border/60 space-y-3">
            <p className="text-xs text-muted-foreground">Verify your email before creating an account</p>
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
              onClick={handleVerifyCode}
              className="w-full py-3 bg-gradient-to-r from-primary/80 to-purple-600/80 text-primary-foreground font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-primary/30 disabled:opacity-60"
              disabled={otpLoading || otpVerified || !formData.email.trim() || !otpCode.trim()}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              {otpLoading ? 'Verifying...' : otpVerified ? 'Verified' : 'Verify Email'}
            </motion.button>
            {otpSent && !otpVerified && (
              <p className="text-xs text-muted-foreground">
                Enter the code sent to your email.
              </p>
            )}
          </div>

          {/* Password Input */}
          <div className="space-y-2">
            <div className="relative flex items-center">
              <Lock className="absolute left-4 h-5 w-5 text-muted-foreground z-10" />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
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
            {fieldErrors.password && (
              <p className="text-destructive text-sm flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {fieldErrors.password}
              </p>
            )}
          </div>

          {/* Confirm Password Input */}
          <div className="space-y-2">
            <div className="relative flex items-center">
              <Lock className="absolute left-4 h-5 w-5 text-muted-foreground z-10" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                name="confirmPassword"
                placeholder="Confirm password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                className="w-full pl-12 pr-12 py-4 bg-background/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground backdrop-blur-sm transition-all focus:outline-none focus:border-primary focus:bg-background/80 focus:ring-4 focus:ring-primary/10"
              />
              <button
                type="button"
                className="absolute right-4 text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {fieldErrors.confirmPassword && (
              <p className="text-destructive text-sm flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          {/**Influencer code */}
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

          {/* Submit Button */}
          <motion.button
            type="submit"
            className="w-full py-4 mt-4 bg-gradient-to-r from-primary to-purple-600 text-primary-foreground font-semibold rounded-xl transition-all hover:shadow-lg hover:shadow-primary/30 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-none"
            disabled={loading || !areAllFieldsFilled()}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </motion.button>
        </form>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-muted-foreground text-sm">
            Already have an account?{' '}
            <Link to="/login" className="text-primary font-semibold hover:text-primary/80 transition-colors">
              Sign in here
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Signup; 
