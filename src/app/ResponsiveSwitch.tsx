"use client";

import type { ReactNode } from "react";
import { useIsMobile } from "./useIsMobile";

// Picks the desktop OR mobile subtree off the single useIsMobile() source.
//
// Before mount (isMobile === null) BOTH are rendered, each wrapped so CSS shows
// only the one matching the 640px boundary — correct first paint, no flash, no
// hydration mismatch. After mount, only the matching subtree stays mounted (the
// other unmounts), so the heavy desktop canvas never runs on a phone, and the
// mobile tree never mounts on desktop. The `min-[641px]:` classes mirror the
// hook's MOBILE_MAX so JS and CSS agree by construction.
export default function ResponsiveSwitch({ desktop, mobile }: { desktop: ReactNode; mobile: ReactNode }) {
  const isMobile = useIsMobile();
  const showDesktop = isMobile === null || isMobile === false;
  const showMobile = isMobile === null || isMobile === true;
  return (
    <>
      <div className="hidden min-[641px]:block">{showDesktop ? desktop : null}</div>
      <div className="min-[641px]:hidden">{showMobile ? mobile : null}</div>
    </>
  );
}
