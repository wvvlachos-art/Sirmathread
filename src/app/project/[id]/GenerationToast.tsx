"use client";

import { useEffect } from "react";
import ToastHost, { showToast } from "@/app/layer1/Toast";
import { GENERATED_FLAG } from "@/app/layer1/generate";

// Mounted on the Layer-2 project page. If we just arrived here from a successful
// generation (flag set in sessionStorage before navigating), flash a one-time
// confirmation toast. Also hosts the toast renderer for this page.
export default function GenerationToast() {
  useEffect(() => {
    try {
      const msg = sessionStorage.getItem(GENERATED_FLAG);
      if (msg) {
        sessionStorage.removeItem(GENERATED_FLAG);
        // Small delay so the toast lands after the page paints.
        const t = setTimeout(() => showToast(msg), 150);
        return () => clearTimeout(t);
      }
    } catch {
      /* sessionStorage unavailable — no toast, no harm */
    }
  }, []);

  return <ToastHost />;
}
