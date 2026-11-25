// Minimal typing for Vite's import.meta.glob, so `vite` is not needed as a dev dependency.
interface ImportMeta {
  glob(pattern: string, options: { eager: true }): Record<string, unknown>;
}
