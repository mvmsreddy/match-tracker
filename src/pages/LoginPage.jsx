import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DEMO_CREDENTIALS, usingMock, loginWithGoogle } from '../api';
import { Card, CardContent } from '@/components/primitives/card';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import {
  Trophy, Mail, Lock, Eye, EyeOff, User, Users, Heart, Calendar,
  Activity, BarChart3, ArrowRight, Loader2,
} from 'lucide-react';

const ROLES = [
  { id: 'player', label: 'Player', desc: 'I compete in tournaments', icon: User },
  { id: 'coach', label: 'Coach', desc: 'I train players', icon: Users },
  { id: 'parent', label: 'Parent', desc: 'My child competes', icon: Heart },
  { id: 'organizer', label: 'Organizer', desc: 'I host tournaments', icon: Calendar },
];

const FEATURES = [
  { icon: Activity, title: 'Live match scoring', desc: 'Track every point, game, and set as it happens, court-side.' },
  { icon: BarChart3, title: 'Deep performance stats', desc: 'Shot placement, rally length, and win/loss trends over time.' },
  { icon: Users, title: 'Built for your whole team', desc: 'Share match history and progress with coaches and players.' },
];

export default function LoginPage() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
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

  const redirectTo = location.state?.from?.pathname || '/';

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
      if (mode === 'signup') {
        await signup(email, password, name, role);
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
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Hero panel — desktop only */}
      <div
        className="hidden lg:flex lg:w-[45%] xl:w-[42%] relative flex-col justify-between overflow-hidden p-10 xl:p-14"
        style={{ background: 'linear-gradient(150deg, hsl(222 65% 12%) 0%, hsl(222 78% 20%) 45%, hsl(222 92% 30%) 100%)' }}
      >
        <div className="absolute -top-28 -right-20 w-80 h-80 rounded-full bg-accent/20 blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-32 -left-16 w-72 h-72 rounded-full bg-blue-400/10 blur-[100px] pointer-events-none" />
        <svg className="absolute inset-0 w-full h-full opacity-[0.06] pointer-events-none" preserveAspectRatio="none">
          <defs>
            <pattern id="court-lines" width="140" height="140" patternUnits="userSpaceOnUse">
              <rect x="10" y="10" width="120" height="120" fill="none" stroke="white" strokeWidth="1.5" />
              <line x1="10" y1="70" x2="130" y2="70" stroke="white" strokeWidth="1.5" />
              <line x1="70" y1="10" x2="70" y2="130" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#court-lines)" />
        </svg>

        <div className="relative flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-sm bg-accent flex items-center justify-center flex-shrink-0">
            <Trophy className="w-4 h-4 text-accent-foreground" strokeWidth={2.5} />
          </div>
          <span className="font-display font-extrabold text-lg tracking-tighter text-white">TENNIS TRACKER</span>
        </div>

        <div className="relative max-w-md space-y-9">
          <h1 className="font-display font-extrabold text-4xl xl:text-[2.6rem] leading-[1.08] tracking-tight text-white">
            Every point,<br />tracked with precision.
          </h1>
          <p className="text-white/65 text-[15px] leading-relaxed">
            The match-tracking companion built for competitive players, coaches, and tournament organizers.
          </p>
          <div className="space-y-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-sm bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <f.icon className="w-4 h-4 text-white" strokeWidth={2} />
                </div>
                <div>
                  <div className="font-semibold text-[13.5px] text-white">{f.title}</div>
                  <div className="text-white/55 text-xs mt-1 leading-relaxed">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-white/35 text-xs">© {new Date().getFullYear()} Tennis Tracker Pro</div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-5 sm:p-8">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-sm bg-accent flex items-center justify-center">
              <Trophy className="w-4 h-4 text-accent-foreground" strokeWidth={2.5} />
            </div>
            <span className="font-display font-extrabold text-base tracking-tighter">TENNIS TRACKER</span>
          </div>

          <Card className="border-border/60 shadow-xl shadow-black/5 lg:shadow-none lg:border-none lg:bg-transparent">
            <CardContent className="p-6 sm:p-8 lg:p-0">
              <div className="mb-7">
                <h2 className="font-display font-extrabold text-[1.7rem] tracking-tight">
                  {mode === 'signup' ? 'Create your account' : 'Welcome back'}
                </h2>
                <p className="text-muted-foreground text-sm mt-1.5">
                  {mode === 'signup' ? "Start tracking matches in minutes — it's free." : 'Sign in to continue tracking your matches.'}
                </p>
              </div>

              <div className="inline-flex w-full border border-border rounded-sm p-1 bg-secondary mb-6">
                <button
                  type="button"
                  className={`flex-1 py-2 rounded-sm text-sm font-semibold transition-all duration-150 ${mode === 'signin' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => switchMode('signin')}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 rounded-sm text-sm font-semibold transition-all duration-150 ${mode === 'signup' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => switchMode('signup')}
                >
                  Sign Up
                </button>
              </div>

              {loginWithGoogle && (
                <>
                  <button
                    type="button"
                    className="w-full h-10 flex items-center justify-center gap-2.5 rounded-sm border border-border bg-card text-sm font-semibold transition-all hover:border-foreground/30 hover:shadow-sm disabled:opacity-50"
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
                  <div className="flex items-center gap-3 my-5 text-xs text-muted-foreground">
                    <div className="flex-1 h-px bg-border" /> or continue with email <div className="flex-1 h-px bg-border" />
                  </div>
                </>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-sm p-3 leading-relaxed">
                    {error}
                  </div>
                )}

                {mode === 'signup' && (
                  <>
                    <div className="space-y-1.5">
                      <label htmlFor="name" className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Full Name</label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                          id="name" type="text" autoComplete="name" value={name}
                          onChange={(e) => setName(e.target.value)} required
                          placeholder="Your name" className="pl-9 pr-3"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs uppercase tracking-wider font-bold text-muted-foreground">I am a</label>
                      <div className="grid grid-cols-2 gap-2">
                        {ROLES.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setRole(r.id)}
                            className={`flex items-start gap-2 p-2.5 rounded-sm border text-left transition-all ${
                              role === r.id ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border hover:border-primary/40'
                            }`}
                          >
                            <r.icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${role === r.id ? 'text-primary' : 'text-muted-foreground'}`} strokeWidth={2} />
                            <span className="min-w-0">
                              <span className="block text-xs font-bold">{r.label}</span>
                              <span className="block text-[10px] text-muted-foreground leading-tight mt-0.5">{r.desc}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="email" type="email" autoComplete="username" value={email}
                      onChange={(e) => setEmail(e.target.value)} required className="pl-9 pr-3"
                      data-testid="login-email-input"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      value={password} onChange={(e) => setPassword(e.target.value)} required className="pl-9 pr-9"
                      data-testid="login-password-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {mode === 'signup' && (
                  <div className="space-y-1.5">
                    <label htmlFor="confirm" className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      <Input
                        id="confirm" type={showConfirm ? 'text' : 'password'} autoComplete="new-password" value={confirm}
                        onChange={(e) => setConfirm(e.target.value)} required className="pl-9 pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showConfirm ? 'Hide password' : 'Show password'}
                      >
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <Button type="submit" size="lg" className="w-full font-semibold mt-2" disabled={submitting} data-testid="login-submit-btn">
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {mode === 'signup' ? 'Creating account...' : 'Signing in...'}
                    </>
                  ) : (
                    <>
                      {mode === 'signup' ? 'Create Account' : 'Sign In'}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>

              {usingMock && mode === 'signin' && (
                <div className="mt-6 pt-5 border-t border-border">
                  <div className="text-xs font-semibold text-muted-foreground">Demo accounts (mock backend — tap to autofill)</div>
                  <div className="mt-2.5 space-y-1.5">
                    {DEMO_CREDENTIALS.map((cred) => (
                      <div
                        key={cred.email}
                        onClick={() => fillDemo(cred)}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-sm border border-border hover:border-primary hover:bg-primary/5 cursor-pointer transition-colors text-xs"
                      >
                        <span className="font-medium">{cred.role === 'coach' ? 'Coach' : 'Parent'} — {cred.email}</span>
                        <span className="text-muted-foreground">{cred.password}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
