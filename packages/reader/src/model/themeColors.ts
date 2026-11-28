import type { Theme } from './highlightColors';

export interface ThemeColors {
  page: string;
  ink: string;
  muted: string;
  faint: string;
  rule: string;
  raised: string;
  inset: string;
  accent: {
    text: string;
    soft: string;
    strong: string;
    onAccent: string;
    control: string;
    solid: string;
  };
}

export const THEME_COLORS: Record<Theme, ThemeColors> = {
  light: {
    page: '#fbfaf8',
    ink: '#27241f',
    muted: '#5b554d',
    faint: '#6f675d',
    rule: '#ebe7e0',
    raised: '#ffffff',
    inset: '#f5f3ef',
    accent: { text: '#3b6953', soft: '#f1f7f4', strong: '#dcebe2', onAccent: '#284439', control: '#4d8369', solid: '#3b6953' },
  },
  sepia: {
    page: '#f2e8d9',
    ink: '#3a3224',
    muted: '#625646',
    faint: '#6b5f4d',
    rule: '#e2d3ba',
    raised: '#f8f1e6',
    inset: '#ebdfcb',
    accent: { text: '#3b6953', soft: '#e9eadb', strong: '#d6e0cc', onAccent: '#284439', control: '#4d8369', solid: '#3b6953' },
  },
  dark: {
    page: '#161512',
    ink: '#d8d6d2',
    muted: '#a9a59e',
    faint: '#8f8b83',
    rule: '#2c2a25',
    raised: '#211f1b',
    inset: '#1f1d1a',
    accent: { text: '#92baa6', soft: '#1b2b24', strong: '#25392f', onAccent: '#dcebe2', control: '#6a9c83', solid: '#3b6953' },
  },
  black: {
    page: '#000000',
    ink: '#b8b4ac',
    muted: '#8f8b83',
    faint: '#86827a',
    rule: '#1f1d1a',
    raised: '#0e0d0b',
    inset: '#161512',
    accent: { text: '#92baa6', soft: '#14211b', strong: '#1f3128', onAccent: '#dcebe2', control: '#6a9c83', solid: '#3b6953' },
  },
};
