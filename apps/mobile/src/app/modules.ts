import type { MobileModule } from './types';

const found = import.meta.glob('../modules/*/routes.tsx', { eager: true }) as Record<
  string,
  { module?: MobileModule }
>;

/** Modules present in `src/modules/*`, in a stable order. */
export function collectModules(files: Record<string, { module?: MobileModule }> = found): MobileModule[] {
  return Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, mod]) => (mod.module ? [mod.module] : []));
}
