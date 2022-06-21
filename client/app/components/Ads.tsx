'use client';

import Script from 'next/script';
import { createContext, useContext, useSyncExternalStore } from 'react';

// Consentement cookies publicitaires : '1' accepté, '0' refusé, null non décidé.
const CONSENT_KEY = 'chat-ads-consent';
const CONSENT_EVENT = 'ads-consent-change';

declare global {
  interface Window {
    AdProvider?: unknown[];
  }
}

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(CONSENT_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(CONSENT_EVENT, callback);
  };
}

function getSnapshot() {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

type AdsContextValue = { consented: boolean };
const AdsContext = createContext<AdsContextValue>({ consented: false });

export function useAds() {
  return useContext(AdsContext);
}

export function AdsProvider({
  children,
  enabled = false
}: {
  children: React.ReactNode;
  enabled?: boolean;
}) {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const consented = stored === '1';
  const decided = stored !== null;

  // Publicités désactivées (aucune zone configurée) : ni script, ni cookies, ni bannière
  if (!enabled) {
    return <AdsContext.Provider value={{ consented: false }}>{children}</AdsContext.Provider>;
  }

  const setConsent = (value: boolean) => {
    try {
      localStorage.setItem(CONSENT_KEY, value ? '1' : '0');
    } catch {
      // localStorage indisponible
    }
    window.dispatchEvent(new Event(CONSENT_EVENT));
  };

  return (
    <AdsContext.Provider value={{ consented }}>
      {children}

      {/* Le script publicitaire n'est chargé qu'après consentement (RGPD) */}
      {consented && (
        <Script
          src="https://a.magsrv.com/ad-provider.js"
          strategy="afterInteractive"
          async
        />
      )}

      {/* Bannière de consentement cookies */}
      {!decided && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 text-sm text-ink-muted sm:flex-row sm:justify-between">
            <p>
              This site uses cookies for advertising and analytics. You can accept or decline
              non-essential cookies.
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => setConsent(false)}
                className="h-9 rounded-full border border-line px-4 text-sm font-medium text-ink hover:bg-surface"
              >
                Decline
              </button>
              <button
                onClick={() => setConsent(true)}
                className="h-9 rounded-full bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </AdsContext.Provider>
  );
}
