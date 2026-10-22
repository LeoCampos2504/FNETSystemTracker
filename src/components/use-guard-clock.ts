"use client";
import { useEffect, useState } from 'react';
/** Refresh the effective segment while a screen remains open over the 08:00 handover. */
export function useGuardClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  return now;
}
