"use client";

import { useEffect, useState } from "react";

// SINGLE source of truth for the mobile breakpoint. The Tailwind `min-[641px]:`
// utilities used by <ResponsiveSwitch> mirror this exact 640px boundary, so the JS
// mount-gate and the CSS can never disagree.
export const MOBILE_MAX = 640;

// Returns null until mounted, then true/false. The null phase lets <ResponsiveSwitch>
// render both subtrees for the very first paint (CSS shows the right one — no flash,
// no hydration mismatch); after mount only the matching subtree stays mounted.
export function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}
