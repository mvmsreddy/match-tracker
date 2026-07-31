import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DEMO_CREDENTIALS, usingMock, loginWithGoogle } from '../api';
import { Card, CardContent } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import {
  Trophy, Mail, Lock, Eye, EyeOff, User, Users, Heart, Calendar, Apple,
  ArrowRight, Loader2, Sparkles,
} from 'lucide-react';

const ROLES = [
  { id: 'player', label: 'Player', desc: 'I compete', icon: User },
  { id: 'coach', label: 'Coach', desc: 'I train players', icon: Users },
  { id: 'parent', label: 'Parent', desc: 'My child plays', icon: Heart },
  { id: 'nutritionist', label: 'Nutritionist', desc: 'I plan meals', icon: Apple },
  { id: 'organizer', label: 'Organizer', desc: 'I host events', icon: Calendar },
];

const ROTATING_STATS = [
  { value: '12,847', label: 'Matches tracked this month' },
  { value: '3.2M', label: 'Rally points logged' },
  { value: '89%', label: 'Players improve within 30 days' },
  { value: '420+', label: 'AITA circuits covered' },
];

export default function LoginPage() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState('player');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [statIdx, setStatIdx] = useState(0);

  const redirectTo = location.state?.from?.pathname || '/';

  useEffect(() => {
    const t = setInterval(() => setStatIdx(i => (i + 1) % ROTATING_STATS.length), 3500);
    return () => clearInterval(t);
  }, []);

  function switchMode(next) {
    setMode(next);
    setError('');
    setName('');
    setEmail('');
    setPassword('');
    setConfirm('');
    setRole('player');
    setShowPassword(false);
    setShowConfirm(false);
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
      if (mode === 'signup') await signup(email, password, name, role);
      else await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const msg = err.message || '';
      if (msg.toLowerCase().includes('email not confirmed')) {
        setError('Email not confirmed — check your inbox, or use "Continue with Google".');
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

  const currentStat = ROTATING_STATS[statIdx];

  return (
    <div className="min-h-screen bg-[#0a1128] text-white flex" data-testid="login-page">
      {/* ------------------------------------------------------------- */}
      {/* HERO PANEL — desktop only                                     */}
      {/* ------------------------------------------------------------- */}
      <div
        className="hidden lg:flex lg:w-[52%] xl:w-[48%] relative flex-col justify-between overflow-hidden p-10 xl:p-14"
        style={{ background: 'linear-gradient(160deg,#050914 0%,#0a1128 40%,#111a3d 100%)' }}
      >
        {/* Ambient glows */}
        <div className="absolute -top-40 -right-24 w-[440px] h-[440px] rounded-full pointer-events-none"
             style={{ background: 'radial-gradient(circle, rgba(120,180,255,0.20) 0%, transparent 65%)' }} />
        <div className="absolute -bottom-32 -left-16 w-[360px] h-[360px] rounded-full pointer-events-none"
             style={{ background: 'radial-gradient(circle, rgba(255,200,120,0.15) 0%, transparent 60%)' }} />

        {/* Grain overlay */}
        <div className="absolute inset-0 opacity-[0.05] pointer-events-none"
             style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />

        {/* Court motif */}
        <svg className="absolute inset-x-0 bottom-0 w-full opacity-[0.09] pointer-events-none" viewBox="0 0 400 240" preserveAspectRatio="none">
          <g fill="none" stroke="white" strokeWidth="0.6">
            <rect x="40" y="20" width="320" height="200" />
            <line x1="40" y1="120" x2="360" y2="120" />
            <line x1="200" y1="20" x2="200" y2="220" strokeDasharray="3 3" />
            <rect x="100" y="60" width="200" height="120" />
            <line x1="100" y1="120" x2="300" y2="120" />
          </g>
        </svg>

        {/* Brand */}
        <div className="relative flex items-center gap-3 z-10">
          <div className="relative">
            <div className="absolute inset-0 rounded-lg bg-amber-400/40 blur-md" />
            <div className="relative w-10 h-10 rounded-lg bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-slate-900" strokeWidth={2.5} />
            </div>
          </div>
          <div>
            <div className="font-display font-extrabold text-lg tracking-tight text-white leading-none">TENNIS TRACKER</div>
            <div className="text-[12px] uppercase tracking-[0.3em] text-white/40 mt-1">PRO · EST. 2025</div>
          </div>
        </div>

        {/* Main copy */}
        <div className="relative z-10 max-w-lg space-y-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-xs font-medium text-white/80 tracking-wide">Trusted by AITA-ranked players</span>
          </div>

          <h1 className="font-display font-extrabold text-[3.4rem] xl:text-[4rem] leading-[0.95] tracking-[-0.03em] text-white">
            Every point.<br />
            <span className="italic font-light text-white/75">Every</span> insight.<br />
            <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-300 bg-clip-text text-transparent">Elevate</span> your game.
          </h1>

          <p className="text-white/60 text-[15px] leading-relaxed max-w-md">
            The definitive companion for competitive tennis — from serve-side coaches to rising juniors chasing their first AITA rank.
          </p>

          {/* Rotating stat */}
          <div className="relative pt-2">
            <div className="absolute left-0 top-2 bottom-0 w-[3px] bg-gradient-to-b from-amber-300 to-transparent rounded-full" />
            <div className="pl-5 min-h-[72px]">
              <div
                key={currentStat.value}
                className="font-display font-extrabold text-4xl tracking-tighter text-white transition-all duration-500"
                style={{ animation: 'fadeSlide 0.6s ease-out' }}
              >
                {currentStat.value}
              </div>
              <div className="text-xs uppercase tracking-[0.2em] text-white/50 font-semibold mt-1">
                {currentStat.label}
              </div>
            </div>
            <div className="flex gap-1.5 mt-4 pl-5">
              {ROTATING_STATS.map((_, i) => (
                <div
                  key={i}
                  className={`h-[3px] rounded-full transition-all duration-500 ${i === statIdx ? 'w-8 bg-amber-300' : 'w-3 bg-white/15'}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between text-xs text-white/40">
          <span>© {new Date().getFullYear()} Tennis Tracker Pro</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            All systems operational
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* FORM PANEL                                                    */}
      {/* ------------------------------------------------------------- */}
      <div className="flex-1 flex items-center justify-center p-5 sm:p-8 bg-[#f7f6f2] text-slate-900 relative overflow-hidden">
        {/* Mobile ambient */}
        <div className="lg:hidden absolute inset-x-0 top-0 h-56 pointer-events-none"
             style={{ background: 'linear-gradient(180deg,#0a1128 0%,#111a3d 60%,transparent 100%)' }} />
        <div className="lg:hidden absolute -top-16 -right-16 w-72 h-72 rounded-full pointer-events-none"
             style={{ background: 'radial-gradient(circle, rgba(255,200,120,0.20) 0%, transparent 65%)' }} />

        <div className="w-full max-w-[420px] relative z-10">
          {/* Mobile brand header */}
          <div className="lg:hidden text-center mb-8 pt-2">
            <div className="inline-flex items-center gap-2.5 mb-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-lg bg-amber-400/50 blur-md" />
                <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center">
                  <Trophy className="w-4 h-4 text-slate-900" strokeWidth={2.5} />
                </div>
              </div>
              <span className="font-display font-extrabold text-lg tracking-tight text-white">TENNIS TRACKER</span>
            </div>
            <div className="text-[12px] uppercase tracking-[0.35em] text-white/50 font-semibold">PRO · EST. 2025</div>
          </div>

          <Card className="border-none shadow-[0_20px_60px_-15px_rgba(10,17,40,0.15)] bg-white lg:shadow-[0_1px_0_0_rgba(0,0,0,0.03)] lg:border lg:border-slate-200/70">
            <CardContent className="p-7 sm:p-9">
              {/* Header */}
              <div className="mb-7">
                <div className="text-xs uppercase tracking-[0.25em] font-bold text-amber-600 mb-2">
                  {mode === 'signup' ? '· Get started' : '· Welcome back'}
                </div>
                <h2 className="font-display font-extrabold text-[2rem] leading-[1.05] tracking-[-0.02em] text-slate-900">
                  {mode === 'signup' ? (
                    <>Join the <span className="italic font-light">movement</span>.</>
                  ) : (
                    <>Ready to <span className="italic font-light">serve</span>?</>
                  )}
                </h2>
                <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                  {mode === 'signup'
                    ? 'Create your account in seconds — no credit card, no commitment.'
                    : 'Sign in to pick up right where you left off on the court.'}
                </p>
              </div>

              {/* Mode toggle */}
              <div className="inline-flex w-full border border-slate-200 rounded-full p-1 bg-slate-100/70 mb-6">
                <button
                  type="button"
                  className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                    mode === 'signin'
                      ? 'bg-slate-900 text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  onClick={() => switchMode('signin')}
                  data-testid="mode-signin-btn"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
                    mode === 'signup'
                      ? 'bg-slate-900 text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  onClick={() => switchMode('signup')}
                  data-testid="mode-signup-btn"
                >
                  Sign Up
                </button>
              </div>

              {/* Google OAuth */}
              {loginWithGoogle && (
                <>
                  <button
                    type="button"
                    className="w-full h-11 flex items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 transition-all hover:border-slate-400 hover:shadow-sm active:scale-[0.99] disabled:opacity-50"
                    disabled={googleLoading}
                    onClick={handleGoogleLogin}
                    data-testid="google-signin-btn"
                  >
                    <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                    {googleLoading ? 'Redirecting…' : 'Continue with Google'}
                  </button>
                  <div className="flex items-center gap-3 my-5 text-[11px] uppercase tracking-widest text-slate-400 font-semibold">
                    <div className="flex-1 h-px bg-slate-200" /> or with email <div className="flex-1 h-px bg-slate-200" />
                  </div>
                </>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 leading-relaxed"
                       data-testid="login-error">
                    {error}
                  </div>
                )}

                {mode === 'signup' && (
                  <>
                    <div className="space-y-1.5">
                      <label htmlFor="name" className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500">Full Name</label>
                      <div className="relative group">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none group-focus-within:text-amber-600 transition-colors" />
                        <Input
                          id="name" type="text" autoComplete="name" value={name}
                          onChange={(e) => setName(e.target.value)} required
                          placeholder="Your name"
                          className="pl-10 pr-3 h-11 bg-slate-50/50 border-slate-200 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/5 rounded-lg text-slate-900 placeholder:text-slate-400"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500">I am a</label>
                      <div className="grid grid-cols-2 gap-2">
                        {ROLES.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setRole(r.id)}
                            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-all ${
                              role === r.id
                                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                            }`}
                            data-testid={`role-${r.id}-btn`}
                          >
                            <r.icon className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                            <span className="min-w-0">
                              <span className="block text-xs font-bold leading-tight">{r.label}</span>
                              <span className={`block text-[12px] leading-tight mt-0.5 ${role === r.id ? 'text-white/60' : 'text-slate-500'}`}>{r.desc}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500">Email address</label>
                  <div className="relative group">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none group-focus-within:text-amber-600 transition-colors" />
                    <Input
                      id="email" type="email" autoComplete="username" value={email}
                      onChange={(e) => setEmail(e.target.value)} required
                      placeholder="you@example.com"
                      className="pl-10 pr-3 h-11 bg-slate-50/50 border-slate-200 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/5 rounded-lg text-slate-900 placeholder:text-slate-400"
                      data-testid="login-email-input"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500">Password</label>
                  <div className="relative group">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none group-focus-within:text-amber-600 transition-colors" />
                    <Input
                      id="password" type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      value={password} onChange={(e) => setPassword(e.target.value)} required
                      placeholder="••••••••"
                      className="pl-10 pr-10 h-11 bg-slate-50/50 border-slate-200 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/5 rounded-lg text-slate-900 placeholder:text-slate-400"
                      data-testid="login-password-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      data-testid="toggle-password-btn"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {mode === 'signup' && (
                  <div className="space-y-1.5">
                    <label htmlFor="confirm" className="text-[11px] uppercase tracking-[0.15em] font-bold text-slate-500">Confirm password</label>
                    <div className="relative group">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none group-focus-within:text-amber-600 transition-colors" />
                      <Input
                        id="confirm" type={showConfirm ? 'text' : 'password'} autoComplete="new-password" value={confirm}
                        onChange={(e) => setConfirm(e.target.value)} required
                        placeholder="••••••••"
                        className="pl-10 pr-10 h-11 bg-slate-50/50 border-slate-200 focus:bg-white focus:border-slate-900 focus:ring-2 focus:ring-slate-900/5 rounded-lg text-slate-900 placeholder:text-slate-400"
                        data-testid="login-confirm-input"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((s) => !s)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 transition-colors"
                        aria-label={showConfirm ? 'Hide password' : 'Show password'}
                      >
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="group w-full h-12 mt-2 rounded-xl bg-slate-900 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-all hover:bg-slate-800 active:scale-[0.99] disabled:opacity-60 shadow-lg shadow-slate-900/25"
                  data-testid="login-submit-btn"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {mode === 'signup' ? 'Creating account…' : 'Signing in…'}
                    </>
                  ) : (
                    <>
                      {mode === 'signup' ? 'Create account' : 'Sign in'}
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>

                {mode === 'signin' && (
                  <div className="text-center text-xs text-slate-500 pt-1">
                    New to Tennis Tracker?{' '}
                    <button type="button" onClick={() => switchMode('signup')} className="text-slate-900 font-semibold hover:text-amber-600 transition-colors">
                      Create an account
                    </button>
                  </div>
                )}
              </form>

              {/* Demo credentials */}
              {usingMock && mode === 'signin' && (
                <div className="mt-6 pt-5 border-t border-slate-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <div className="text-[11px] uppercase tracking-widest font-bold text-slate-500">Demo accounts</div>
                  </div>
                  <div className="space-y-2">
                    {DEMO_CREDENTIALS.map((cred) => (
                      <button
                        key={cred.email}
                        type="button"
                        onClick={() => fillDemo(cred)}
                        className="w-full flex items-center justify-between gap-2 p-3 rounded-lg border border-slate-200 hover:border-slate-900 hover:bg-slate-50 transition-all text-left"
                        data-testid={`demo-${cred.role}-btn`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 capitalize">{cred.role}</div>
                          <div className="text-[11px] text-slate-500 truncate">{cred.email}</div>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 shrink-0">{cred.password}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Trust footer */}
          <div className="text-center text-[11px] text-slate-500 mt-6 leading-relaxed">
            By continuing, you agree to our <span className="font-semibold text-slate-700">Terms</span> and <span className="font-semibold text-slate-700">Privacy Policy</span>.
          </div>
        </div>
      </div>

      {/* Keyframes for stat rotation */}
      <style>{`
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
