import React from 'react';
import { X, Smartphone, Share, PlusSquare, Download, CheckCircle } from 'lucide-react';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNativeInstall?: () => void;
  canNativeInstall: boolean;
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({
  isOpen,
  onClose,
  onNativeInstall,
  canNativeInstall,
}) => {
  if (!isOpen) return null;

  const isIOS =
    typeof navigator !== 'undefined' &&
    (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-slide-up">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-500 text-white flex items-center justify-center shadow-md shadow-brand-500/20">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Install Curious-Y</h2>
              <p className="text-xs text-slate-500">Add to your phone for full-screen microlearning</p>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {canNativeInstall ? (
            <div className="space-y-4 text-center py-2">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-brand-400 flex items-center justify-center text-white text-2xl font-extrabold shadow-lg shadow-brand-500/25">
                ?Y
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Install directly to your home screen</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Enjoy instant access, fast offline loading, and a full standalone app experience.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (onNativeInstall) onNativeInstall();
                  onClose();
                }}
                className="w-full py-3 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Install App Now</span>
              </button>
            </div>
          ) : isIOS ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                <div className="w-8 h-8 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Share className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Step 1: Tap the Share Button</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    In Safari&apos;s toolbar at the bottom of your screen, tap the Share icon.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
                  <PlusSquare className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">Step 2: Add to Home Screen</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Scroll down and select <span className="font-semibold text-slate-700">&quot;Add to Home Screen&quot;</span>.
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>Curious-Y will appear on your home screen just like a native app!</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-xs text-slate-600">
              <p>To install Curious-Y on your mobile browser:</p>
              <ol className="list-decimal list-inside space-y-2 pl-1 font-medium text-slate-700">
                <li>Tap your browser menu (<span className="font-bold">⋮</span> or <span className="font-bold">⋯</span>).</li>
                <li>Select <span className="font-bold text-brand-700">&quot;Install app&quot;</span> or <span className="font-bold text-brand-700">&quot;Add to Home screen&quot;</span>.</li>
                <li>Confirm to add the app icon to your phone.</li>
              </ol>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-900 text-xs font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
