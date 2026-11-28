import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useReaderLocale, useReaderT } from '../../i18n';
import { SearchIcon } from '../view/icons';
import { MIN_QUERY, type SearchHit } from './types';
import { formatPercent } from '../view/format';
import styles from './SearchTab.module.css';

export interface SearchTabProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** The results so far, in book order. */
  results: readonly SearchHit[];
  /** 0 to 1: how much of the book has been searched. */
  progress: number;
  done: boolean;
  onPick: (hit: SearchHit) => void;
  autoFocus?: boolean;
}

interface Group {
  label: string | null;
  hits: Array<{ hit: SearchHit; index: number }>;
}

function group(results: readonly SearchHit[]): Group[] {
  const groups: Group[] = [];
  results.forEach((hit, index) => {
    const label = hit.sectionLabel;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.hits.push({ hit, index });
    else groups.push({ label, hits: [{ hit, index }] });
  });
  return groups;
}

export const ANNOUNCE_EVERY_MS = 2000;

/**
 * The text for the live region: it follows `text` at once when `immediate`
 * (the search is over), and while searching changes at most every 2 seconds.
 */
function useThrottledAnnouncement(text: string, immediate: boolean): string {
  const [shown, setShown] = useState(text);
  const last = useRef(Date.now());
  const latest = useRef(text);
  latest.current = text;
  useEffect(() => {
    if (text === shown) return;
    const wait = immediate ? 0 : last.current + ANNOUNCE_EVERY_MS - Date.now();
    const apply = () => {
      last.current = Date.now();
      setShown(latest.current);
    };
    if (wait <= 0) {
      apply();
      return;
    }
    const id = setTimeout(apply, wait);
    return () => clearTimeout(id);
  }, [text, shown, immediate]);
  return shown;
}

/** The search field and its results by chapter; arrows move, Enter chooses. */
export function SearchTab({ query, onQueryChange, results, progress, done, onPick, autoFocus = false }: SearchTabProps) {
  const t = useReaderT();
  const locale = useReaderLocale();
  const base = useId();
  const input = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(0);
  const ready = query.trim().length >= MIN_QUERY;
  const groups = useMemo(() => group(results), [results]);
  const current = Math.min(active, results.length - 1);
  const optionId = (i: number) => `${base}-o${i}`;
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    if (ready && current >= 0) document.getElementById(optionId(current))?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, ready]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!ready || results.length === 0) return;
    if (e.key === 'ArrowDown') setActive(Math.min(results.length - 1, current + 1));
    else if (e.key === 'ArrowUp') setActive(Math.max(0, current - 1));
    else if (e.key === 'Enter') onPick(results[current]!);
    else return;
    e.preventDefault();
  };

  const n = results.length;
  const count = done
    ? t(n === 1 ? 'rpanel.search.count_one' : 'rpanel.search.count_other', { count: n })
    : t(n === 1 ? 'rpanel.search.so_far_one' : 'rpanel.search.so_far_other', { count: n });
  const none = ready && done && n === 0;
  const target = ready ? (none ? t('rpanel.search.none') : n > 0 || !done ? count : '') : '';

  const announce = useThrottledAnnouncement(target, done || !ready);

  return (
    <div className={styles.search}>
      <div className={styles.field}>
        <SearchIcon />
        <input
          ref={input}
          type="text"
          role="combobox"
          className={styles.input}
          value={query}
          placeholder={t('rpanel.search.placeholder')}
          aria-label={t('rpanel.search.label')}
          aria-autocomplete="list"
          aria-expanded={ready && n > 0}
          aria-controls={`${base}-list`}
          aria-activedescendant={ready && n > 0 ? optionId(current) : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setActive(0);
            onQueryChange(e.target.value);
          }}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button
            type="button"
            className={styles.clear}
            aria-label={t('rpanel.search.clear')}
            onClick={() => {
              onQueryChange('');
              input.current?.focus();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        ) : null}
      </div>
      <p className={styles.count} aria-live="polite">
        {announce}
      </p>
      {ready ? null : <p className={styles.hint}>{t('rpanel.search.hint')}</p>}
      <div id={`${base}-list`} role="listbox" aria-label={t('rpanel.search.results')} className={styles.results} hidden={!ready || n === 0}>
        {groups.map((g, gi) => (
          <div key={gi} role="group" aria-labelledby={`${base}-g${gi}`} className={styles.group}>
            <h3 id={`${base}-g${gi}`} className={styles.chapter}>
              {g.label ?? t('rpanel.search.no_chapter')}
            </h3>
            {g.hits.map(({ hit, index }) => (
              <div
                key={hit.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === current}
                className={styles.hit}
                onClick={() => {
                  setActive(index);
                  onPick(hit);
                }}
              >
                <span className={styles.where}>{formatPercent(hit.fraction, locale)}</span>
                <span className={styles.snippet}>
                  {hit.pre}
                  <mark className={styles.match}>{hit.match}</mark>
                  {hit.post}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {ready && !done ? (
        <div className={styles.progress}>
          <span>{t('rpanel.search.progress')}</span>
          <div
            role="progressbar"
            aria-label={t('rpanel.search.progress')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className={styles.rail}
          >
            <span className={styles.fill} style={{ width: `${percent}%` }} />
          </div>
          <span className={styles.percent}>{t('rpanel.search.progress_value', { percent })}</span>
        </div>
      ) : null}
    </div>
  );
}
