import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, isAuthenticated, completeNewPasswordChallenge } from '../services/authService';
import './Login.css';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [userAttributesForPasswordChange, setUserAttributesForPasswordChange] = useState(null);
  const [requiredAttributesForPasswordChange, setRequiredAttributesForPasswordChange] = useState([]);

  // Redirect if already authenticated
  useEffect(() => {
    const checkAuth = async () => {
      const authenticated = await isAuthenticated();
      if (authenticated) {
        navigate('/dashboard');
      }
    };
    checkAuth();
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn(email, password);
      
      // Check if new password is required
      if (result.code === 'NEW_PASSWORD_REQUIRED') {
        // CognitoUser is now stored in module scope in authService.js
        // to preserve its internal authentication state
        setUserAttributesForPasswordChange(result.userAttributes || {});
        setRequiredAttributesForPasswordChange(result.requiredAttributes || []);
        setShowPasswordChange(true);
        setLoading(false);
        return;
      }
      
      // Normal login success
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password policy (AWS Cognito default requirements)
    const passwordErrors = [];
    
    if (newPassword.length < 8) {
      passwordErrors.push('at least 8 characters');
    }
    if (!/[A-Z]/.test(newPassword)) {
      passwordErrors.push('an uppercase letter');
    }
    if (!/[a-z]/.test(newPassword)) {
      passwordErrors.push('a lowercase letter');
    }
    if (!/[0-9]/.test(newPassword)) {
      passwordErrors.push('a number');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(newPassword)) {
      passwordErrors.push('a special character (!@#$%^&*...)');
    }
    
    if (passwordErrors.length > 0) {
      setError(`Password must contain: ${passwordErrors.join(', ')}`);
      return;
    }

    setLoading(true);

    try {
      // CognitoUser is stored in module scope in authService.js
      // No need to pass it - the function will retrieve it from module scope
      await completeNewPasswordChallenge(
        newPassword,
        userAttributesForPasswordChange,
        requiredAttributesForPasswordChange
      );
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Failed to set new password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-box">
          <div className="login-header">
            <div className="login-logo">
              <img 
                src="/images/Hirshberg-logo.png"
                alt="Hirshberg Group Logo" 
                className="login-logo-img"
                onError={(e) => {
                  const attemptedPath = e.target.src;
                  console.error('Failed to load login logo. Attempted path:', attemptedPath);
                  
                  // Try alternative paths
                  const alternatives = [
                    `${process.env.PUBLIC_URL || ''}/images/Hirshberg-logo.png`,
                    `${window.location.origin}/images/Hirshberg-logo.png`
                  ];
                  
                  const currentAttempt = alternatives.find(alt => !attemptedPath.includes(alt.split('/').pop()));
                  if (currentAttempt && e.target.dataset.attempts !== '3') {
                    e.target.dataset.attempts = (parseInt(e.target.dataset.attempts || '0') + 1).toString();
                    e.target.src = currentAttempt;
                  } else {
                    console.error('All image paths failed. Image will be hidden.');
                    e.target.style.display = 'none';
                  }
                }}
              />
            </div>
            <h1 className="login-title">BTS Quotation Assistant</h1>
            <p className="login-subtitle">Sign in to your account</p>
          </div>

          {!showPasswordChange ? (
            <form onSubmit={handleLogin} className="login-form">
              <div className="form-group">
                <label htmlFor="email" className="form-label">Email</label>
                <input
                  id="email"
                  type="email"
                  className="form-input"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="password" className="form-label">Password</label>
                <input
                  id="password"
                  type="password"
                  className="form-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="login-error" style={{ color: 'red', marginBottom: '1rem', fontSize: '0.875rem' }}>
                  {error}
                </div>
              )}

              <button 
                type="submit" 
                className="btn-primary login-button"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordChange} className="login-form">
              <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#e3f2fd', borderRadius: '4px' }}>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#1976d2' }}>
                  This is your first login. Please set a new password.
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="newPassword" className="form-label">New Password</label>
                <input
                  id="newPassword"
                  type="password"
                  className="form-input"
                  placeholder="Enter new password (min 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={8}
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirmPassword" className="form-label">Confirm New Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  className="form-input"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={8}
                />
              </div>

              {error && (
                <div className="login-error" style={{ color: 'red', marginBottom: '1rem', fontSize: '0.875rem' }}>
                  {error}
                </div>
              )}

              <button 
                type="submit" 
                className="btn-primary login-button"
                disabled={loading}
              >
                {loading ? 'Setting password...' : 'Set New Password'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowPasswordChange(false);
                  setUserAttributesForPasswordChange(null);
                  setRequiredAttributesForPasswordChange([]);
                  setNewPassword('');
                  setConfirmPassword('');
                  setError('');
                }}
                className="btn-secondary"
                style={{ 
                  marginTop: '0.5rem', 
                  width: '100%',
                  backgroundColor: 'transparent',
                  color: '#666',
                  border: '1px solid #ddd'
                }}
                disabled={loading}
              >
                Back to Login
              </button>
            </form>
          )}

          <p className="login-footer">
            Don't have an account? Contact your administrator
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;

