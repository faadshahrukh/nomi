import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useNetworkState } from 'expo-network';

interface NetworkValue {
  /** true/false once known, null while unknown. Never assume online while null. */
  online: boolean | null;
  /** Development override used by the component gallery to preview offline states. */
  override: boolean | null;
  setOverride: (v: boolean | null) => void;
}
const Ctx = createContext<NetworkValue>({ online: null, override: null, setOverride: () => undefined });

export function NetworkProvider({ children }: { children: ReactNode }) {
  const net = useNetworkState();
  const [override, setOverride] = useState<boolean | null>(null);
  const real = net.isInternetReachable ?? net.isConnected ?? null;
  const value = useMemo(() => ({ online: override ?? real, override, setOverride }), [override, real]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useOnline = (): boolean | null => useContext(Ctx).online;
export const useNetworkOverride = () => { const { override, setOverride } = useContext(Ctx); return { override, setOverride }; };
