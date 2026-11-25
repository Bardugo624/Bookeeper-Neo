import type { CSSProperties } from 'react';

// The only place in the shelf module where literal colors may live: cabinet tones and the shared spine shading.
export const SHELF_COLORS: readonly string[] = [
  '#7c8f6a', // sage
  '#b8704f', // terracotta
  '#3a4a6b', // night
  '#6b3a5f', // plum
  '#c9954a', // amber
  '#4a4a4a', // graphite
];

const WHITE = '#fff';
const BLACK = '#000';

/** Cylinder shading shared by every spine. */
export const SPINE_SHADE = `linear-gradient(90deg, rgb(255 255 255 / 0.22), rgb(255 255 255 / 0.04) 28%, rgb(0 0 0 / 0.05) 72%, rgb(0 0 0 / 0.24))`;

/** Light wood-grain overlay for the frame. */
const GRAIN = `repeating-linear-gradient(90deg, rgb(0 0 0 / 0.05) 0 1px, transparent 1px 7px), linear-gradient(180deg, rgb(255 255 255 / 0.14), rgb(255 255 255 / 0.02) 50%, rgb(0 0 0 / 0.16))`;

/** Soft shadow under the top board of each niche. */
const NICHE = 'linear-gradient(180deg, rgb(0 0 0 / 0.34), rgb(0 0 0 / 0))';

/** CSS variables that carry every literal color of a cabinet, so the stylesheets stay token-only. */
export function shelfVars(color: string): CSSProperties {
  return {
    '--shelf-color': color,
    '--shelf-back': `color-mix(in srgb, ${color} 55%, ${BLACK})`,
    '--shelf-board': `color-mix(in srgb, ${color} 80%, ${WHITE})`,
    '--shelf-grain': GRAIN,
    '--shelf-niche': NICHE,
    '--shelf-cast': 'rgb(0 0 0 / 0.35)',
    '--shelf-empty': 'rgb(255 255 255 / 0.12)',
    '--spine-shade': SPINE_SHADE,
    '--spine-glow': WHITE,
  } as CSSProperties;
}
