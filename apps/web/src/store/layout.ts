import { create } from "zustand";

interface LayoutState {
  libraryOpen: boolean;
  inspectorOpen: boolean;
  toggleLibrary: () => void;
  toggleInspector: () => void;
  openInspector: () => void;
  closeInspector: () => void;
  adaptToCompact: () => void;
}

const compact = () => typeof window !== "undefined" && window.innerWidth < 760;

export const useLayoutStore = create<LayoutState>((set) => ({
  libraryOpen: !compact(),
  inspectorOpen: !compact(),
  toggleLibrary: () =>
    set((s) => ({ libraryOpen: !s.libraryOpen, ...(compact() ? { inspectorOpen: false } : {}) })),
  toggleInspector: () =>
    set((s) => ({ inspectorOpen: !s.inspectorOpen, ...(compact() ? { libraryOpen: false } : {}) })),
  openInspector: () => set({ inspectorOpen: true, ...(compact() ? { libraryOpen: false } : {}) }),
  closeInspector: () => set({ inspectorOpen: false }),
  adaptToCompact: () =>
    set((s) => (compact() && s.libraryOpen && s.inspectorOpen ? { libraryOpen: false } : {})),
}));
