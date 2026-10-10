'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ShellSelection =
  | { kind: 'none' }
  | { kind: 'table'; tableId: string }
  | { kind: 'menuItem'; menuItemId: string }
  | { kind: 'order'; orderId: string };

type ShellContextValue = {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  selection: ShellSelection;
  selectTable: (tableId: string) => void;
  selectMenuItem: (menuItemId: string) => void;
  selectOrder: (orderId: string) => void;
  clearSelection: () => void;
  /** Convenience: order id when selection is an order. */
  selectedOrderId: string | null;
  setSelectedOrderId: (orderId: string | null) => void;
  addOrderOpen: boolean;
  openAddOrder: () => void;
  closeAddOrder: () => void;
  refreshToken: number;
  bumpRefresh: () => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selection, setSelection] = useState<ShellSelection>({ kind: 'none' });
  const [addOrderOpen, setAddOrderOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const selectTable = useCallback((tableId: string) => {
    setSelection({ kind: 'table', tableId });
  }, []);

  const selectMenuItem = useCallback((menuItemId: string) => {
    setSelection({ kind: 'menuItem', menuItemId });
  }, []);

  const selectOrder = useCallback((orderId: string) => {
    setSelection({ kind: 'order', orderId });
  }, []);

  const clearSelection = useCallback(() => {
    setSelection({ kind: 'none' });
  }, []);

  const setSelectedOrderId = useCallback((orderId: string | null) => {
    if (orderId === null) {
      setSelection({ kind: 'none' });
      return;
    }
    setSelection({ kind: 'order', orderId });
  }, []);

  const openAddOrder = useCallback(() => setAddOrderOpen(true), []);
  const closeAddOrder = useCallback(() => setAddOrderOpen(false), []);
  const bumpRefresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  const selectedOrderId = selection.kind === 'order' ? selection.orderId : null;

  const value = useMemo(
    () => ({
      searchQuery,
      setSearchQuery,
      selection,
      selectTable,
      selectMenuItem,
      selectOrder,
      clearSelection,
      selectedOrderId,
      setSelectedOrderId,
      addOrderOpen,
      openAddOrder,
      closeAddOrder,
      refreshToken,
      bumpRefresh,
    }),
    [
      searchQuery,
      selection,
      selectTable,
      selectMenuItem,
      selectOrder,
      clearSelection,
      selectedOrderId,
      setSelectedOrderId,
      addOrderOpen,
      openAddOrder,
      closeAddOrder,
      refreshToken,
      bumpRefresh,
    ],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (ctx === null) {
    throw new Error('useShell must be used inside ShellProvider');
  }
  return ctx;
}
