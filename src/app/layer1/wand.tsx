"use client";

import { createContext, useContext, useState } from "react";

export type ArmedTag = { id: string; value: string; color: string } | null;

const WandContext = createContext<{
  armed: ArmedTag;
  setArmed: (t: ArmedTag) => void;
}>({ armed: null, setArmed: () => {} });

// Shares the "magic wand" state (which tag is loaded) between the toolbar
// button and the canvas where you click to apply it.
export function WandProvider({ children }: { children: React.ReactNode }) {
  const [armed, setArmed] = useState<ArmedTag>(null);
  return <WandContext.Provider value={{ armed, setArmed }}>{children}</WandContext.Provider>;
}

export const useWand = () => useContext(WandContext);
