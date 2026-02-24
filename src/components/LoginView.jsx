import React from "react";
import { useState } from 'react';
import { signIn, signUp } from '../auth/authApi';
import { useToast } from '../context/ToastProvider';

export default function LoginView() {
  const { addToast } = useToast();
  const [authMode, setAuthMode] = useState('login');
  const [authFullName, setAuthFullName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState(null);

  const handleSupabaseSubmit = async (event) => {
    event.preventDefault();
    setAuthError(null);
    try {
      if (authMode === 'signup') {
        await signUp({ email: authEmail, password: authPassword, fullName: authFullName });
        addToast('Registration successful! Please verify your email to login.', 'success');
        setAuthMode('login');
        setAuthPassword('');  // Clear password for security
      } else {
        await signIn({ email: authEmail, password: authPassword });
      }
    } catch (err) {
      setAuthError(err.message);
      // Optional: also show error toast? The inline error is usually better for forms, 
      // but consistent feedback is good. Let's keep inline for now as it's already there
      // or duplicate it. User asked for success message primarily.
      addToast(err.message, 'error');
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img src="/assets/Mr_Bur_Logo-01.png" alt="MR.BUR" />
        </div>
        <h1 className="login-title">{authMode === 'login' ? 'Welcome back' : 'Create Account'}</h1>
        <p className="login-subtitle">
          {authMode === 'login' ? 'Sign in to access your appointments' : 'Sign up to get started'}
        </p>

        {authMode === 'login' && (
          <div className="login-sample-accounts">
            <div className="login-sample-title">Sample Dentist account:</div>
            <div className="login-sample-item">Email: mrbur123@gmail.com</div>
            <div className="login-sample-item">Password: mrbur@123</div>
            <div className="login-sample-title" style={{ marginTop: 10 }}>Sample Admin account:</div>
            <div className="login-sample-item">Email: adminbur@gmail.com</div>
            <div className="login-sample-item">Password: bur@123</div>
          </div>
        )}

        <form className="login-form" onSubmit={handleSupabaseSubmit}>
          {authMode === 'signup' && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                className="form-input"
                value={authFullName}
                onChange={(e) => setAuthFullName(e.target.value)}
                placeholder="Full name"
              />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              placeholder="Email"
            />
          </div>
          {/* <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              placeholder="Password"
            />
          </div> */}
          {/* Keep password for login, hide for signup testing */}
          {authMode === 'login' && (
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Password"
              />
            </div>
          )}
          {authError && <div className="form-error">{authError}</div>}
          <button className="btn btn-primary login-submit" type="submit">
            {authMode === 'signup' ? 'Create Account' : 'Login'}
          </button>

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: '14px', color: 'var(--text-secondary)' }}>
            {authMode === 'login' ? (
              <>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => setAuthMode('signup')}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                >
                  Log in
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
