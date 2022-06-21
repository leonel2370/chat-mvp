'use client';

import { useEffect, useRef } from 'react';
import { useAds } from './Ads';

// Zone publicitaire ExoClick. Ne rend rien si l'identifiant de zone est absent
// ou si le consentement cookies n'a pas été donné.
export function AdSlot({ zoneId, className }: { zoneId?: string; className?: string }) {
  const { consented } = useAds();
  const served = useRef(false);

  useEffect(() => {
    if (!consented || !zoneId || served.current) return;
    served.current = true;
    try {
      (window.AdProvider = window.AdProvider || []).push({ serve: {} });
    } catch {
      // script publicitaire pas encore prêt
    }
  }, [consented, zoneId]);

  if (!consented || !zoneId) return null;

  return (
    <div className={className}>
      <ins className="eas6a97888e20" data-zoneid={zoneId} style={{ display: 'block' }} />
    </div>
  );
}
