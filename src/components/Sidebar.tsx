import { LayoutDashboard, Image, Video, Newspaper, PenLine, Settings, Sparkles, LogOut, ChevronRight, X, LogIn } from 'lucide-react';
import { ContentType, User } from '../types';

interface SidebarProps {
  activeTab: ContentType;
  setActiveTab: (tab: ContentType) => void;
  user: User | null;
  onLogout: () => void;
  onOpenAuth: () => void;
  isPro: boolean;
  onUpgrade: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, user, onLogout, onOpenAuth, isPro, onUpgrade, isOpen, onClose }: SidebarProps) {
  const contentTabs: { id: ContentType; label: string; icon: any }[] = [
    { id: 'academic', label: 'Assignments', icon: PenLine },
    { id: 'photos', label: 'Photos', icon: Image },
    { id: 'videos', label: 'Videos', icon: Video },
    { id: 'news', label: 'News', icon: Newspaper },
  ];

  return (
    <aside
      className={`w-64 border-r border-slate-100 bg-white flex flex-col h-screen fixed left-0 top-0 p-5 z-40 transition-transform duration-300 ease-in-out lg:translate-x-0 ${
        isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
      }`}
    >
      {/* Brand Logo Header */}
      <div className="mb-8 px-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-blue-900 leading-none">TruthAI</h1>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">Detection System</p>
          </div>
        </div>
        {/* Close button — only on mobile drawer */}
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 -mr-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          title="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Menus */}
      <nav className="flex-1 space-y-6">
        <div>
          <p className="px-2 pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Content Forensics
          </p>
          <div className="space-y-1">
            {contentTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`nav-btn-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/15'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Global Views */}
        <div>
          <p className="px-2 pb-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Management
          </p>
          <div className="space-y-1">
            <button
              id="nav-btn-dashboard"
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/15'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <LayoutDashboard className={`w-4 h-4 ${activeTab === 'dashboard' ? 'text-white' : 'text-slate-400'}`} />
              <span>History Scans</span>
            </button>
            <button
              id="nav-btn-settings"
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                activeTab === 'settings'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/15'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Settings className={`w-4 h-4 ${activeTab === 'settings' ? 'text-white' : 'text-slate-400'}`} />
              <span>Settings</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Upgrade Callouts & Footer User Section */}
      <div className="mt-auto space-y-4">
        {/* Upgrade Card / Active Plan Card */}
        <div className={`p-4 rounded-2xl border transition-all duration-300 ${
          isPro 
            ? 'bg-gradient-to-br from-indigo-50 to-purple-50 border-purple-100' 
            : 'bg-gradient-to-br from-blue-50/50 to-indigo-50/50 border-blue-100/50'
        }`}>
          <div className="flex items-center gap-1.5 mb-1 bg-white/80 backdrop-blur-sm px-2.5 py-1 rounded-full w-fit">
            <Sparkles className={`w-3 h-3 ${isPro ? 'text-indigo-600' : 'text-blue-600'}`} />
            <span className={`text-[10px] font-bold tracking-wider uppercase ${isPro ? 'text-indigo-600' : 'text-blue-600'}`}>
              {isPro ? 'PRO PLAN ACTIVE' : 'LIMITATIONS DETECTED'}
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-900 mb-1 leading-snug">
            {isPro ? 'Full Synthesis Forensic Active' : 'Upgrade to Forensic Pro'}
          </p>
          <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
            {isPro ? 'Deep synthetic check, batch PDF logs & full API keys available.' : 'Deep analysis for live video feeds, 4K metadata & instant grading keys.'}
          </p>
          {!isPro ? (
            <button
              id="sidebar-upgrade-btn"
              onClick={onUpgrade}
              className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-blue-500/15 transition-all outline-none"
            >
              Upgrade to Pro — $3/mo
            </button>
          ) : (
            <div className="text-[11px] font-bold text-indigo-600 flex items-center gap-1">
              <span>All Pro features unlocked</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        {/* User profile action / guest sign-in */}
        {user ? (
          <div className="flex items-center justify-between border-t border-slate-100 pt-4 px-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm overflow-hidden shrink-0">
                {user.picture ? (
                  <img alt="" className="w-full h-full object-cover" src={user.picture} referrerPolicy="no-referrer" />
                ) : (
                  user.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate" title={user.email}>{user.name}</p>
                <p className="text-[10px] text-indigo-600 font-medium">{isPro ? 'Pro Investigator' : 'Free Tier'}</p>
              </div>
            </div>
            <button
              id="sidebar-logout-btn"
              onClick={onLogout}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            id="sidebar-signin-btn"
            onClick={onOpenAuth}
            className="w-full flex items-center justify-center gap-2 border-t border-slate-100 pt-4 text-xs font-bold text-slate-600 hover:text-blue-600 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            <span>Sign in to save history</span>
          </button>
        )}
      </div>
    </aside>
  );
}
