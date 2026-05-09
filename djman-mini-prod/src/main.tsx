import React from 'react';
import ReactDOM from 'react-dom/client';
import toast, { Toaster, ToastBar } from 'react-hot-toast';
import { BrowserRouter } from 'react-router-dom';
import { JukeboxProvider } from './context/JukeboxContext';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { App } from './App';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Toaster
      position="top-center"
      gutter={16}
      toastOptions={{
        // Le toast reste jusqu'à fermeture manuelle (clic sur X)
        duration: Number.POSITIVE_INFINITY,
        style: {
          background: '#020617',
          color: '#f9fafb',
          border: '1px solid rgba(148, 163, 184, 0.35)',
          fontSize: '0.95rem',
        },
        success: {
          iconTheme: {
            primary: '#22c55e',
            secondary: '#020617',
          },
        },
        error: {
          iconTheme: {
            primary: '#f97373',
            secondary: '#020617',
          },
        },
      }}
    >
      {(t: any) => (
        <ToastBar
          toast={t}
          style={{
            ...t.style,
            width: '100%',
            maxWidth: '90vw',
            padding: '12px 16px',
          }}
        >
          {({ icon, message }: any) => (
            <div className="flex w-full items-start gap-2 sm:gap-3">
              <div className="mt-0.5 sm:mt-1 flex-shrink-0">{icon}</div>
              <div className="flex-1 min-w-0 whitespace-pre-line text-xs sm:text-sm">{message}</div>
              <button
                type="button"
                onClick={() => toast.dismiss(t.id)}
                className="ml-2 min-h-[32px] min-w-[32px] flex items-center justify-center text-base sm:text-lg font-semibold text-slate-400 transition hover:text-white active:scale-95"
                aria-label="Fermer la notification"
              >
                ×
              </button>
            </div>
          )}
        </ToastBar>
      )}
    </Toaster>
    <LanguageProvider>
      <AuthProvider>
        <JukeboxProvider>
          <BrowserRouter
            future={{
              v7_startTransition: true,
              v7_relativeSplatPath: true,
            }}
          >
            <App />
          </BrowserRouter>
        </JukeboxProvider>
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>,
);
