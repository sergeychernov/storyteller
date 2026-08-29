import { createContext, type PropsWithChildren, useContext } from "react";
import type { EffectiveAccess } from "./api.js";

const AccessContext = createContext<EffectiveAccess | null>(null);

export function AccessProvider({ access, children }: PropsWithChildren<{ readonly access: EffectiveAccess }>) {
  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
}

export function useCapability(code: string): boolean {
  const access = useContext(AccessContext);
  if (!access) throw new Error("useCapability must be used inside AccessProvider");
  return hasCapability(access, code);
}

export function hasCapability(access: EffectiveAccess, code: string): boolean {
  return access.capabilities.some((capability) => capability.code === code && capability.allowed);
}
