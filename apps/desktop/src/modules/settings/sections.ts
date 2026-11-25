import type { SectionContext, SettingsSection } from './types';

type Files = Record<string, { section?: SettingsSection }>;

const found = import.meta.glob('./sections/*/section.tsx', { eager: true }) as Files;

/** Sections present under `sections/`, visible for this context, in display order. */
export function collectSections(ctx: SectionContext, files: Files = found): SettingsSection[] {
  return Object.values(files)
    .flatMap((mod) => (mod.section ? [mod.section] : []))
    .filter((s) => s.visible?.(ctx) ?? true)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}
