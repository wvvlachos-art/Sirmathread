"use client";

import { useEffect, useState } from "react";

// Minimal app toast. The app had none (it used window.alert); this is a tiny,
// decoupled replacement so any client component can fire a transient message via
// `showToast(...)` without prop-drilling. <ToastHost/> is mounted once on the
// Layer 1 page and renders whatever the last event carried.

const TOAST_EVENT = "sirma:toast";

export function showToast(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(TOAST_EVENT, { detail: message }));
}

export default function ToastHost() {
  const [toast, setToast] = useState<{ msg: string; key: number } | null>(null);

  useEffect(() => {
    const onToast = (e: Event) => {
      const msg = (e as CustomEvent<string>).detail;
      setToast({ msg, key: Date.now() });
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
      <div
        key={toast.key}
        className="rounded-md border border-hairline bg-paper-surface px-4 py-2 text-sm text-ink shadow-xl"
        role="status"
        aria-live="polite"
      >
        {toast.msg}
      </div>
    </div>
  );
}
