import { Search, Plus, Menu, LogIn, LogOut } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { ContentType, User } from '../types';

interface HeaderProps {
  onNewAnalysis: () => void;
  activeTab: ContentType;
  setActiveTab: (tab: ContentType) => void;
  onSearchHistory: (query: string) => void;
  user: User | null;
  isPro: boolean;
  onOpenAuth: () => void;
  onLogout: () => void;
  onToggleSidebar: () => void;
}

export default function Header({ onNewAnalysis, activeTab, setActiveTab, onSearchHistory, user, isPro, onOpenAuth, onLogout, onToggleSidebar }: HeaderProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <header className="fixed top-0 right-0 left-0 lg:left-64 h-16 bg-white/80 backdrop-blur-md border-b border-slate-100 shadow-sm z-20 px-4 sm:px-6 flex justify-between items-center gap-3">
      {/* Left side title and history search */}
      <div className="flex items-center gap-3 sm:gap-6 flex-1 min-w-0 max-w-xl">
        {/* Hamburger — opens the sidebar drawer on mobile */}
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 -ml-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          title="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <h2
          className="font-display text-base sm:text-lg font-bold text-slate-900 cursor-pointer shrink-0"
          onClick={onNewAnalysis}
        >
          TruthAI<span className="hidden sm:inline"> Detector</span>
        </h2>

        {/* Search — compact on mobile, full on sm+ */}
        <div className="relative flex-1 min-w-0 max-w-xs">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            id="history-quick-search"
            onChange={(e) => onSearchHistory(e.target.value)}
            placeholder="Search history..."
            className="w-full pl-9 pr-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all font-sans text-xs"
          />
        </div>
      </div>

      {/* Right side navigation guides and CTA actions */}
      <div className="flex items-center gap-4 sm:gap-6 shrink-0">
        <nav className="hidden md:flex items-center gap-6">
          <button
            id="hdr-nav-dashboard"
            onClick={() => setActiveTab('dashboard')}
            className={`font-sans text-xs font-bold py-5 border-b-2 transition-all ${
              activeTab === 'dashboard'
                ? 'text-blue-600 border-blue-600'
                : 'text-slate-500 border-transparent hover:text-blue-600'
            }`}
          >
            Dashboard
          </button>
          <button
            id="hdr-nav-api"
            onClick={() => setActiveTab('settings')}
            className={`font-sans text-xs font-semibold py-5 text-slate-500 hover:text-blue-600 border-b-2 border-transparent transition-all`}
          >
            API Setup
          </button>
          <a
            href="https://ai.studio/build"
            target="_blank"
            rel="noopener noreferrer"
            className="font-sans text-xs font-semibold py-5 text-slate-500 hover:text-blue-600 transition-all"
          >
            Docs
          </a>
        </nav>

        {/* Action Button */}
        <button
          id="header-new-analysis-btn"
          onClick={onNewAnalysis}
          className="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-full shadow-md shadow-blue-500/10 transition-all active:scale-[0.98] flex items-center gap-1.5 outline-none shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New Analysis</span>
        </button>

        {/* Divider & User Profile / Sign-in control */}
        <div className="hidden sm:block w-px h-5 bg-slate-200"></div>

        {user ? (
          <div className="relative shrink-0" ref={profileRef}>
            <button
              id="profile-menu-btn"
              onClick={() => setProfileOpen((v) => !v)}
              className="w-8 h-8 rounded-full border border-slate-200 overflow-hidden flex items-center justify-center bg-blue-600 text-white text-xs font-bold cursor-pointer"
              title={user.email}
              aria-expanded={profileOpen}
              aria-haspopup="true"
            >
              {user.picture ? (
                <img alt="Profile" className="w-full h-full object-cover" src={user.picture} referrerPolicy="no-referrer" />
              ) : (
                <span>{user.name.slice(0, 2).toUpperCase()}</span>
              )}
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-10 w-52 bg-white border border-slate-100 shadow-xl rounded-xl p-3 z-50">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Signed in as</p>
                <p className="text-xs font-bold text-slate-800 truncate">{user.email}</p>
                <p className={`text-[11px] font-bold mt-1 ${isPro ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {isPro ? 'TruthAI Pro' : 'Free plan'}
                </p>
                <button
                  id="profile-logout-btn"
                  onClick={() => { setProfileOpen(false); onLogout(); }}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-600 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          // Guest → clicking the profile control opens the login page
          <button
            id="profile-signin-btn"
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-slate-50 rounded-full text-xs font-bold text-slate-600 transition-colors shrink-0"
            title="Sign in"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
}
