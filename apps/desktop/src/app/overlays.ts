import { create } from 'zustand';

interface OverlayState {
  palette: boolean;
  shortcuts: boolean;
  openPalette(): void;
  closePalette(): void;
  togglePalette(): void;
  openShortcuts(): void;
  closeShortcuts(): void;
}

/** Which app-wide overlays are open. The shell opens them, the palette module draws them. */
export const useOverlays = create<OverlayState>((set) => ({
  palette: false,
  shortcuts: false,
  openPalette: () => set({ palette: true, shortcuts: false }),
  closePalette: () => set({ palette: false }),
  togglePalette: () => set((s) => ({ palette: !s.palette, shortcuts: false })),
  openShortcuts: () => set({ shortcuts: true, palette: false }),
  closeShortcuts: () => set({ shortcuts: false }),
}));

/** Test hook: closes everything. */
export function resetOverlaysForTest(): void {
  useOverlays.setState({ palette: false, shortcuts: false });
}
