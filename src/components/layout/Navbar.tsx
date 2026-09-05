import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  History,
  LogOut,
  ChevronDown,
  User,
  Key,
  Smartphone,
  Network,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { InstallAppModal } from '../common/InstallAppModal';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface NavbarProps {
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onOpenConcepts?: () => void;
  onGoHome?: () => void;
  onResetProgress?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenSettings,
  onOpenHistory,
  onOpenConcepts,
  onGoHome,
  onResetProgress,
}) => {
  const { user, signOut, isDemoUser } = useAuth();
  const { settings } = useSettings();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if app is running as standalone PWA
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        Boolean((window.navigator as unknown as { standalone?: boolean }).standalone);
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleNativeInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  const hasApiKey = !!settings.apiKey && settings.apiKey.trim().length > 0;
  const avatarUrl = user?.user_metadata?.avatar_url;
  const fullName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Learner';

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand Logo */}
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-3 text-left group cursor-pointer focus:outline-hidden"
          title="Return to home / choose topic"
        >
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-brand-400 flex items-center justify-center text-white shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform duration-200">
            <span className="font-extrabold text-lg tracking-wider">?Y</span>
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-lg text-slate-900 tracking-tight group-hover:text-brand-600 transition-colors">
                Curious-Y
              </span>
              <span className="hidden lg:inline text-[10px] uppercase font-bold tracking-widest bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded-md border border-brand-200">
                Microlearning
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium hidden sm:block">
              Master the &quot;Why&quot; with your own LLM
            </p>
          </div>
        </button>

        {/* Right Actions */}
        <div className="flex items-center gap-1 sm:gap-3">
          {/* Install App Button (When available or on mobile/tablets) */}
          {!isStandalone && (
            <button
              type="button"
              onClick={() => {
                if (deferredPrompt) {
                  handleNativeInstall();
                } else {
                  setInstallModalOpen(true);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100/80 border border-brand-200/70 transition-all cursor-pointer"
              title="Install Curious-Y PWA on your device"
            >
              <Smartphone className="w-4 h-4 text-brand-600" />
              <span className="hidden sm:inline">Install</span>
            </button>
          )}

          {/* Concepts / Knowledge Graph Button */}
          {onOpenConcepts && (
            <button
              type="button"
              onClick={onOpenConcepts}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100/80 hover:bg-slate-200/80 transition-all cursor-pointer"
              title="View Knowledge Graph and Concepts DAG"
            >
              <Network className="w-4 h-4 text-brand-600" />
              <span className="hidden sm:inline">Concepts</span>
            </button>
          )}

          {/* History Button */}
          <button
            type="button"
            onClick={onOpenHistory}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100/80 hover:bg-slate-200/80 transition-all cursor-pointer"
            title="View learning history and chats"
          >
            <History className="w-4 h-4 text-indigo-600" />
            <span className="hidden sm:inline">History</span>
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100/80 hover:bg-slate-200/80 transition-all cursor-pointer"
            title="Configure LLM Provider & Topics"
          >
            <SettingsIcon className="w-4 h-4 text-slate-600" />
            <span className="hidden sm:inline">Settings</span>
            {!hasApiKey && (
              <span className="flex h-2 w-2 relative" title="API key not yet configured">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
            )}
          </button>

          {/* Reset Progress Button */}
          {onResetProgress && (
            <button
              type="button"
              onClick={onResetProgress}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100/80 border border-rose-200/70 transition-all cursor-pointer"
              title="Reset all learning progress"
              aria-label="Reset Progress"
            >
              <RotateCcw className="w-4 h-4 text-rose-600" />
              <span className="hidden sm:inline">Reset Progress</span>
            </button>
          )}

          {/* User Profile Menu */}
          {user && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center gap-2 p-1.5 pr-2.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 transition-all cursor-pointer"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={fullName}
                    className="w-7 h-7 rounded-lg object-cover border border-slate-200"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs">
                    <User className="w-4 h-4" />
                  </div>
                )}
                <span className="text-xs font-bold text-slate-800 max-w-[90px] truncate hidden md:inline">
                  {fullName}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {/* Profile Dropdown */}
              {profileDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setProfileDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-40 animate-slide-up">
                    <div className="px-4 py-2.5 border-b border-slate-100">
                      <div className="font-bold text-sm text-slate-900 truncate">{fullName}</div>
                      <div className="text-xs text-slate-500 truncate">{user.email || 'Google User'}</div>
                      {isDemoUser && (
                        <span className="inline-block mt-1 text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">
                          Guest / Preview Mode
                        </span>
                      )}
                    </div>

                    <div className="p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          onOpenSettings();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                      >
                        <Key className="w-4 h-4 text-brand-600" />
                        <span>LLM Configuration</span>
                      </button>

                      {onOpenConcepts && (
                        <button
                          type="button"
                          onClick={() => {
                            setProfileDropdownOpen(false);
                            onOpenConcepts();
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                        >
                          <Network className="w-4 h-4 text-brand-600" />
                          <span>Knowledge Graph (DAG)</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          onOpenHistory();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                      >
                        <History className="w-4 h-4 text-indigo-600" />
                        <span>Saved Question History</span>
                      </button>

                      {!isStandalone && (
                        <button
                          type="button"
                          onClick={() => {
                            setProfileDropdownOpen(false);
                            if (deferredPrompt) {
                              handleNativeInstall();
                            } else {
                              setInstallModalOpen(true);
                            }
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                        >
                          <Smartphone className="w-4 h-4 text-brand-600" />
                          <span>Install Mobile App</span>
                        </button>
                      )}

                      {onResetProgress && (
                        <button
                          type="button"
                          onClick={() => {
                            setProfileDropdownOpen(false);
                            onResetProgress();
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4 text-rose-600" />
                          <span>Reset Progress</span>
                        </button>
                      )}

                      <div className="my-1 border-t border-slate-100" />

                      <button
                        type="button"
                        onClick={async () => {
                          setProfileDropdownOpen(false);
                          await signOut();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <InstallAppModal
        isOpen={installModalOpen}
        onClose={() => setInstallModalOpen(false)}
        onNativeInstall={handleNativeInstall}
        canNativeInstall={!!deferredPrompt}
      />
    </header>
  );
};
