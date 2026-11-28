import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { Button, Icon } from '@bookeeper/ui/base';
import { Popover } from '@bookeeper/ui/overlays';
import { useReaderLocale, useReaderT } from '../../i18n';
import {
  DEFAULT_SETTINGS,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  type FontChoice,
  type ReaderSettings,
  type ThemeChoice,
} from '../../model';
import { THEME_COLORS } from '../../model/themeColors';
import { Sheet } from '../view/Sheet';
import { Segmented, type SegmentedOption } from './Segmented';
import styles from './Look.module.css';

export interface AppearancePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A small window on the computer, a sheet from the bottom on the phone. */
  layout: 'desktop' | 'phone';
  /** A PDF only takes theme, zoom and two pages. */
  format: string;
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
  /** Computer: the Aa button the popover hangs from. */
  trigger?: ReactElement;
}

/** The typeface of each choice, so its name is written in it. `publisher` shows Lora, the fallback. */
export const FONT_FACES: Record<FontChoice, string> = {
  publisher: "'Lora Variable', Georgia, serif",
  lora: "'Lora Variable', Georgia, serif",
  inter: "'Inter Variable', system-ui, sans-serif",
  serif: 'ui-serif, Georgia, serif',
  sans: 'system-ui, sans-serif',
};

function ThemeFace({ theme }: { theme: ThemeChoice }) {
  if (theme === 'auto') {
    const half = (c: (typeof THEME_COLORS)['light'], cls: string) => (
      <span className={`${styles.autoHalf} ${cls}`} style={{ background: c.page, color: c.ink }}>
        Aa
      </span>
    );
    return (
      <span className={styles.autoFace}>
        {half(THEME_COLORS.light, styles.autoLight)}
        {half(THEME_COLORS.dark, styles.autoDark)}
      </span>
    );
  }
  const c = THEME_COLORS[theme];
  return (
    <span className={styles.autoHalf} style={{ background: c.page, color: c.ink }}>
      Aa
    </span>
  );
}

const THEMES: readonly ThemeChoice[] = ['auto', 'light', 'sepia', 'dark', 'black'];
const FONTS: readonly FontChoice[] = ['publisher', 'lora', 'inter', 'serif', 'sans'];
const LINES = [1.4, 1.6, 1.8] as const;
const MARGINS = ['narrow', 'medium', 'wide'] as const;
const FLOWS = ['paginated', 'scrolled'] as const;
const FITS = ['width', 'page'] as const;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      {children}
    </div>
  );
}

function Switch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
  return (
    <div className={styles.switchRow}>
      <span className={styles.rowLabel} aria-hidden="true">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        className={styles.switch}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.knob} />
      </button>
    </div>
  );
}

function Body({ layout, format, settings, onChange }: Omit<AppearancePanelProps, 'open' | 'onOpenChange'>) {
  const t = useReaderT();
  const locale = useReaderLocale();
  const pdf = format === 'pdf';
  const set = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => onChange({ ...settings, [key]: value });
  const option = <T extends string>(ns: string, values: readonly T[], style?: (v: T) => CSSProperties): SegmentedOption<T>[] =>
    values.map((v) => ({ value: v, label: t(`rlook.${ns}.${v}`), style: style?.(v) }));
  const number = new Intl.NumberFormat(locale, { minimumFractionDigits: 1 });
  const lines: SegmentedOption<(typeof LINES)[number]>[] = LINES.map((v) => ({ value: v, label: number.format(v) }));

  return (
    <div className={styles.panel} data-layout={layout}>
      <Row label={t('rlook.appearance.theme')}>
        <Segmented label={t('rlook.appearance.theme')} value={settings.theme} options={THEMES.map((v) => ({ value: v, label: t(`rlook.theme.${v}`), swatch: <ThemeFace theme={v} /> }))} onChange={(v) => set('theme', v)} tiles />
      </Row>
      <Row label={t('rlook.appearance.font')}>
        <Segmented
          label={t('rlook.appearance.font')}
          value={settings.font}
          options={option('font', FONTS, (v) => ({ fontFamily: FONT_FACES[v] }))}
          onChange={(v) => set('font', v)}
          disabled={pdf}
          wrap
        />
      </Row>
      <Row label={t('rlook.appearance.size')}>
        <div className={styles.stepper} role="group" aria-label={t('rlook.appearance.size')}>
          <button
            type="button"
            className={styles.step}
            aria-label={t('rlook.appearance.size_less')}
            disabled={pdf || settings.fontSize <= MIN_FONT_SIZE}
            onClick={() => set('fontSize', Math.max(MIN_FONT_SIZE, settings.fontSize - 1))}
          >
            <Icon name="minimize" />
          </button>
          <output className={styles.sizeValue}>{t('rlook.appearance.size_value', { size: settings.fontSize })}</output>
          <button
            type="button"
            className={styles.step}
            aria-label={t('rlook.appearance.size_more')}
            disabled={pdf || settings.fontSize >= MAX_FONT_SIZE}
            onClick={() => set('fontSize', Math.min(MAX_FONT_SIZE, settings.fontSize + 1))}
          >
            <Icon name="plus" />
          </button>
        </div>
      </Row>
      <Row label={t('rlook.appearance.line')}>
        <Segmented label={t('rlook.appearance.line')} value={settings.lineHeight} options={lines} onChange={(v) => set('lineHeight', v)} disabled={pdf} />
      </Row>
      <Row label={t('rlook.appearance.margins')}>
        <Segmented label={t('rlook.appearance.margins')} value={settings.margins} options={option('margins', MARGINS)} onChange={(v) => set('margins', v)} disabled={pdf} />
      </Row>
      <Row label={t('rlook.appearance.flow')}>
        <Segmented label={t('rlook.appearance.flow')} value={settings.flow} options={option('flow', FLOWS)} onChange={(v) => set('flow', v)} disabled={pdf} />
      </Row>
      {pdf ? (
        <Row label={t('rlook.appearance.fit')}>
          <Segmented label={t('rlook.appearance.fit')} value={settings.pdfFit} options={option('fit', FITS)} onChange={(v) => set('pdfFit', v)} />
        </Row>
      ) : null}
      {layout === 'phone' ? null : (
        <Switch label={t('rlook.appearance.two_pages')} checked={settings.twoPages} onChange={(v) => set('twoPages', v)} disabled={false} />
      )}
      <Switch label={t('rlook.appearance.justify')} checked={settings.justify} onChange={(v) => set('justify', v)} disabled={pdf} />
      <Switch label={t('rlook.appearance.hyphenate')} checked={settings.hyphenate} onChange={(v) => set('hyphenate', v)} disabled={pdf} />
      <Switch label={t('rlook.appearance.publisher')} checked={settings.publisherStyles} onChange={(v) => set('publisherStyles', v)} disabled={pdf} />
      {pdf ? <p className={styles.note}>{t('rlook.appearance.pdf_note')}</p> : null}
    </div>
  );
}

/**
 * The Aa panel: every row changes `ReaderSettings` through `onChange`, and the page follows at once.
 * For a PDF the rows that do not count are off. «Ripristina» puts back the defaults.
 */
export function AppearancePanel(props: AppearancePanelProps) {
  const t = useReaderT();
  const { open, onOpenChange, layout, settings, onChange } = props;
  const footer = (
    <div className={styles.footer}>
      <span className={styles.scope}>{t(layout === 'phone' ? 'rlook.appearance.scope_phone' : 'rlook.appearance.scope_desktop')}</span>
      <Button variant="ghost" size="sm" onClick={() => onChange({ ...DEFAULT_SETTINGS, panelOpen: settings.panelOpen })}>
        {t('rlook.appearance.reset')}
      </Button>
    </div>
  );
  const body = <Body {...props} />;
  if (layout === 'phone') {
    return (
      <Sheet open={open} onOpenChange={onOpenChange} title={t('rlook.appearance.title')} footer={footer}>
        {body}
      </Sheet>
    );
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange} label={t('rlook.appearance.title')} trigger={props.trigger ?? <span />} side="bottom" align="end">
      <div className={styles.popover}>
        {body}
        {footer}
      </div>
    </Popover>
  );
}
