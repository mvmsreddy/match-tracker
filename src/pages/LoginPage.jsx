import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DEMO_CREDENTIALS, usingMock, loginWithGoogle } from '../api';

export default function LoginPage() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const redirectTo = location.state?.from?.pathname || '/';

  function switchMode(next) {
    setMode(next);
    setError('');
    setName('');
    setEmail('');
    setPassword('');
    setConfirm('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (mode === 'signup') {
      if (password !== confirm) { setError('Passwords do not match'); return; }
      if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    }

    setSubmitting(true);
    try {
      if (mode === 'signup') {
        await signup(email, password, name);
      } else {
        await login(email, password);
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const msg = err.message || '';
      if (msg.toLowerCase().includes('email not confirmed')) {
        setError('Email not confirmed — check your inbox for the confirmation link, or use "Continue with Google" to sign in.');
      } else {
        setError(msg || (mode === 'signup' ? 'Signup failed' : 'Login failed'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    if (!loginWithGoogle) return;
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      // Google OAuth redirects the browser — execution won't continue past here
    } catch (err) {
      setError(err.message || 'Google sign-in failed');
      setGoogleLoading(false);
    }
  }

  function fillDemo(cred) {
    setMode('signin');
    setEmail(cred.email);
    setPassword(cred.password);
    setError('');
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-title">Match Tracker Pro</h1>

        <div className="login-tab-row">
          <button
            className={'login-tab' + (mode === 'signin' ? ' active' : '')}
            onClick={() => switchMode('signin')}
            type="button"
          >
            Sign In
          </button>
          <button
            className={'login-tab' + (mode === 'signup' ? ' active' : '')}
            onClick={() => switchMode('signup')}
            type="button"
          >
            Sign Up
          </button>
        </div>

        {loginWithGoogle && (
          <>
            <button
              type="button"
              className="login-google-btn"
              disabled={googleLoading}
              onClick={handleGoogleLogin}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                <path fill="none" d="M0 0h48v48H0z"/>
              </svg>
              {googleLoading ? 'Redirecting...' : 'Continue with Google'}
            </button>
            <div className="login-divider"><span>or</span></div>
          </>
        )}

        <form onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}

          {mode === 'signup' && (
            <div className="login-field">
              <label htmlFor="name">Full Name</label>
              <input
                id="name" type="text" autoComplete="name" value={name}
                onChange={(e) => setName(e.target.value)} required
                placeholder="Your name"
              />
            </div>
          )}

          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input
              id="email" type="email" autoComplete="username" value={email}
              onChange={(e) => setEmail(e.target.value)} required
            />
          </div>
          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} required
            />
          </div>

          {mode === 'signup' && (
            <div className="login-field">
              <label htmlFor="confirm">Confirm Password</label>
              <input
                id="confirm" type="password" autoComplete="new-password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} required
              />
            </div>
          )}

          <button type="submit" className="login-btn" disabled={submitting}>
            {submitting
              ? (mode === 'signup' ? 'Creating account...' : 'Signing in...')
              : (mode === 'signup' ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        {usingMock && mode === 'signin' && (
          <div className="login-demo">
            <b>Demo accounts (mock backend — tap to autofill):</b>
            {DEMO_CREDENTIALS.map((cred) => (
              <div key={cred.email} className="login-demo-row" onClick={() => fillDemo(cred)}>
                <span>{cred.role === 'coach' ? 'Coach' : 'Parent'} — {cred.email}</span>
                <span>{cred.password}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
