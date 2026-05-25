"use client";

import { useEffect, useRef } from "react";

// Scroll container for the timeline. On load it jumps horizontally so the
// recent activity is in view (otherwise you'd start staring at empty future).
export default function ScrollArea({
  scrollToX,
  children,
}: {
  scrollToX: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollLeft = Math.max(0, scrollToX);
  }, [scrollToX]);

  return (
    <div ref={ref} className="min-h-0 flex-1 overflow-auto">
      {children}
    </div>
  );
}
