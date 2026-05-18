import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Slot = ReactNode | null;

interface Ctx {
  slot: Slot;
  setSlot: (n: Slot) => void;
}

const HeaderSlotContext = createContext<Ctx | null>(null);

export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<Slot>(null);
  return (
    <HeaderSlotContext.Provider value={{ slot, setSlot }}>
      {children}
    </HeaderSlotContext.Provider>
  );
}

export function useHeaderSlotValue(): Slot {
  const ctx = useContext(HeaderSlotContext);
  return ctx?.slot ?? null;
}

/** Mount a node into the global app header slot for the lifetime of this component. */
export function useHeaderSlot(node: ReactNode, deps: ReadonlyArray<unknown> = []) {
  const ctx = useContext(HeaderSlotContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.setSlot(node);
    return () => ctx.setSlot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
