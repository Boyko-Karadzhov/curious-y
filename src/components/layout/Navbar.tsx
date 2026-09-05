import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  History,
  LogOut,
  ChevronDown,
  User,
  Smartphone,
  Network,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
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

  const avatarUrl = user?.user_metadata?.avatar_url;
  const fullName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Learner';

  return (
    <header className="app-navbar sticky top-0 z-30 bg-[#0b1b2b]/95 backdrop-blur-xl border-b border-white/10 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand Logo */}
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-3 text-left group cursor-pointer focus:outline-hidden"
          title="Return to home / choose topic"
        >
          <div className="w-10 h-10 rounded-xl border border-amber-200/50 bg-gradient-to-br from-amber-200 via-amber-400 to-orange-500 flex items-center justify-center text-[#281a08] shadow-lg shadow-amber-500/10 group-hover:scale-105 transition-transform duration-200">
            <span className="font-black text-lg tracking-wider">?Y</span>
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-1.5">
              <span className="font-display font-black text-lg text-white tracking-tight group-hover:text-amber-200 transition-colors">
                Curious-Y
              </span>
              <span className="text-[9px] uppercase font-black tracking-widest bg-amber-300/10 text-amber-200 px-1.5 py-0.5 rounded-md border border-amber-300/20">
                Kingdoms
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-semibold hidden sm:block">
              Build your realm with knowledge
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
              title="Install Curious-Y PWA on your device"
            >
              <Smartphone className="w-4 h-4 text-sky-300" />
              <span className="hidden sm:inline">Install</span>
            </button>
          )}

          {/* Concepts / Knowledge Graph Button */}
          {onOpenConcepts && (
            <button
              type="button"
              onClick={onOpenConcepts}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
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
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
            title="View learning history and chats"
          >
            <History className="w-4 h-4 text-indigo-600" />
            <span className="hidden sm:inline">History</span>
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={onOpenSettings}
              className="relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
            title="Application settings"
          >
              <SettingsIcon className="w-4 h-4 text-slate-300" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          {/* Reset Progress Button */}
          {onResetProgress && (
            <button
              type="button"
              onClick={onResetProgress}
              className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-300 bg-rose-400/5 hover:bg-rose-400/10 border border-rose-300/10 transition-all cursor-pointer"
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
                className="flex items-center gap-2 p-1.5 pr-2.5 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
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
                <span className="text-xs font-bold text-slate-200 max-w-[90px] truncate hidden md:inline">
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
                        <SettingsIcon className="w-4 h-4 text-brand-600" />
                        <span>Application Settings</span>
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
