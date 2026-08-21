import { useState, FormEvent } from 'react';
import { Eye, EyeOff, Sparkles, X } from 'lucide-react';
import { User } from '../types';
import { signInWithGoogle, backendLogin, googleEnabled } from '../auth';
import { legalHref } from '../content/legal';

interface AuthScreenProps {
  onLoginSuccess: (user: User) => void;
  onClose: () => void;
}

export default function AuthScreen({ onLoginSuccess, onClose }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleManualSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const user = await backendLogin(email, password);
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message || 'Sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const user = await signInWithGoogle();
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message || 'Google sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] min-h-screen bg-[#f9f9ff] flex flex-col items-center justify-center p-4 overflow-auto"
      style={{
        backgroundImage: 'radial-gradient(circle at 2px 2px, #e1e2ec 1.5px, transparent 0)',
        backgroundSize: '40px 40px',
      }}
    >
      {/* Brand bar */}
      <header className="fixed top-0 left-0 right-0 h-16 flex items-center justify-between px-6 bg-white/70 backdrop-blur-md border-b border-slate-100 z-50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white">
            <Sparkles className="w-4.5 h-4.5" />
          </div>
          <h1 className="text-md font-display font-black text-blue-900 tracking-tight">TruthAI</h1>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          title="Continue without an account"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      <main className="w-full max-w-md pt-12 flex flex-col items-center">
        <div className="w-full bg-white border border-slate-200 rounded-[24px] p-8 shadow-xl shadow-slate-200/50 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 animate-pulse"></div>

          <div className="text-center mb-8">
            <h2 className="font-display text-2xl font-black text-slate-900 mb-1">Welcome to TruthAI</h2>
            <p className="font-sans text-xs text-slate-400">
              Sign in to save your scan history and unlock Pro. New here? Just sign in to create an account.
            </p>
          </div>

          {googleEnabled && (
            <>
              <button
                id="google-sso-btn"
                onClick={handleGoogle}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-slate-200 rounded-xl font-sans text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors duration-200 mb-6 cursor-pointer outline-none disabled:opacity-60"
              >
                <img
                  alt="Google"
                  className="w-4.5 h-4.5"
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                />
                <span>{isSubmitting ? 'Connecting to Google…' : 'Continue with Google'}</span>
              </button>

              <div className="flex items-center gap-4 mb-6">
                <div className="h-px flex-1 bg-slate-100"></div>
                <span className="font-sans text-[9px] font-bold text-slate-400 uppercase tracking-widest">OR EMAIL</span>
                <div className="h-px flex-1 bg-slate-100"></div>
              </div>
            </>
          )}

          <form onSubmit={handleManualSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="font-sans text-xs font-bold text-slate-600" htmlFor="email">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 text-xs text-slate-800 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="font-sans text-xs font-bold text-slate-600" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 text-xs text-slate-800 transition-all pr-10"
                />
                <button
                  type="button"
                  id="toggle-pass-visibility"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 mt-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95 disabled:bg-slate-300 disabled:shadow-none text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 active:scale-[0.98] transition-all cursor-pointer outline-none flex items-center justify-center gap-1.5"
            >
              <span>Sign In / Create Account</span>
            </button>
          </form>

          <div className="mt-6 text-center space-y-3">
            <button
              onClick={onClose}
              className="font-sans text-xs text-slate-400 hover:text-slate-600 hover:underline block w-full"
            >
              Continue without an account
            </button>
            <p className="text-[10px] text-slate-400 leading-relaxed px-2">
              By signing in you agree to our{' '}
              <a href={legalHref('terms')} className="text-blue-600 hover:underline">Terms</a>
              {' '}and{' '}
              <a href={legalHref('privacy')} className="text-blue-600 hover:underline">Privacy Policy</a>.
            </p>
          </div>
        </div>

        <p className="mt-6 text-[10px] text-slate-400 text-center max-w-sm leading-relaxed">
          Local email accounts are stored in your browser only. For production deployments, use Google sign-in or a server-backed auth provider.
        </p>
      </main>

      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-blue-600/5 rounded-full blur-[100px] pointer-events-none select-none"></div>
      <div className="absolute top-1/4 -right-12 w-64 h-64 bg-indigo-600/5 rounded-full blur-[80px] pointer-events-none select-none"></div>
    </div>
  );
}
