import { create } from "zustand";

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** Increment to force sidebar badge counts to refetch immediately */
  sidebarRefreshKey: number;
  triggerSidebarRefresh: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  sidebarRefreshKey: 0,
  triggerSidebarRefresh: () => set((s) => ({ sidebarRefreshKey: s.sidebarRefreshKey + 1 })),
}));
