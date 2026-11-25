import type { AppModule } from './types';

const found = import.meta.glob('../modules/*/routes.tsx', { eager: true }) as Record<
  string,
  { module?: AppModule }
>;

/** Modules present in `src/modules/*`, in a stable order. */
export function collectModules(files: Record<string, { module?: AppModule }> = found): AppModule[] {
  return Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([, mod]) => (mod.module ? [mod.module] : []));
}
