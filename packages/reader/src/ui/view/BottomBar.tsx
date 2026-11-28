import type { ReactNode } from 'react';
import { Button } from '@bookeeper/ui/base';
import { useReaderLocale, useReaderT } from '../../i18n';
import { BarButton } from './BarButton';
import { formatMinutes, percentOf, percentPhrase } from './format';
import { BookmarkIcon, ComputerIcon, NoteIcon, PhoneIcon, SearchIcon, TocIcon } from './icons';
import { ProgressSlider } from './ProgressSlider';
import type { ReaderLayout } from './useChrome';
import styles from './Bars.module.css';

export interface QuestionAction {
  id: string;
  label: string;
  onClick: () => void;
  primary?: boolean;
}
/** «Continua da …», «Segna come letto»: already worded by the caller. */
export interface Question {
  text: string;
  detail?: string;
  icon?: 'phone' | 'computer';
  actions: readonly QuestionAction[];
}
export interface PhoneActions {
  onToc: () => void;
  onNotes: () => void;
  onSearch: () => void;
  onBookmark: () => void;
  bookmarked: boolean;
}
export interface BottomBarProps {
  layout: ReaderLayout;
  fraction: number;
  ticks: readonly number[];
  chapterAt: (fraction: number) => string | null;
  onSeek: (fraction: number) => void;
  /** Minutes to the end of the chapter and of the book; null until there is a speed. */
  times: { chapter: number | null; book: number | null };
  question: Question | null;
  jumpBack: { percent: number; onBack: () => void } | null;
  phone?: PhoneActions;
}

const QUESTION_ICONS: Record<NonNullable<Question['icon']>, ReactNode> = { phone: <PhoneIcon />, computer: <ComputerIcon /> };

export function BottomBar(props: BottomBarProps) {
  const { layout, fraction, ticks, chapterAt, onSeek, times, question, jumpBack, phone } = props;
  const t = useReaderT();
  const locale = useReaderLocale();
  const phoneLayout = layout === 'phone';

  const progress = (
    <>
      <ProgressSlider fraction={fraction} ticks={ticks} chapterAt={chapterAt} onSeek={onSeek} />
      <p className={styles.times}>
        <strong className={styles.percent}>{t('reader.bottom.percent', { percent: percentOf(fraction) })}</strong>
        {times.chapter !== null ? (
          <span>{' · '}{phoneLayout ? formatMinutes(t, times.chapter) : t('reader.bottom.chapter_left', { time: formatMinutes(t, times.chapter) })}</span>
        ) : null}
        {!phoneLayout && times.book !== null ? <span>{' · '}{t('reader.bottom.book_left', { time: formatMinutes(t, times.book) })}</span> : null}
      </p>
      {jumpBack ? (
        <button type="button" className={styles.jumpBack} onClick={jumpBack.onBack}>
          {percentPhrase(t, 'reader.bottom.jump_back', jumpBack.percent, locale)}
        </button>
      ) : null}
    </>
  );

  return (
    <div className={styles.bottom} data-layout={layout} data-asking={question ? '' : undefined} aria-label={t('reader.bottom.label')} role="group">
      <div className={styles.row}>
        {question ? (
          <div className={styles.question} role="status" aria-live="polite">
            {question.icon ? <span className={styles.questionIcon}>{QUESTION_ICONS[question.icon]}</span> : null}
            <p className={styles.questionText}>
              <strong>{question.text}</strong>
              {question.detail ? <span> {question.detail}</span> : null}
            </p>
            <div className={styles.questionActions}>
              {question.actions.map((a) => (
                a.primary ? (
                  <Button key={a.id} variant="primary" className={styles.primary} onClick={a.onClick}>
                    {a.label}
                  </Button>
                ) : (
                  <button key={a.id} type="button" className={styles.plain} onClick={a.onClick}>
                    {a.label}
                  </button>
                )
              ))}
            </div>
          </div>
        ) : (
          progress
        )}
      </div>
      {phoneLayout && phone ? (
        <div className={styles.tools}>
          <BarButton icon={<TocIcon />} label={t('reader.bottom.toc')} caption={t('reader.bottom.toc')} onClick={phone.onToc} />
          <BarButton icon={<NoteIcon />} label={t('reader.bottom.notes')} caption={t('reader.bottom.notes')} onClick={phone.onNotes} />
          <BarButton icon={<SearchIcon />} label={t('reader.bottom.search')} caption={t('reader.bottom.search')} onClick={phone.onSearch} />
          <BarButton
            icon={<BookmarkIcon filled={phone.bookmarked} />}
            label={phone.bookmarked ? t('reader.bottom.bookmark_remove') : t('reader.bottom.bookmark')}
            caption={phone.bookmarked ? t('reader.bottom.bookmark_remove') : t('reader.bottom.bookmark')}
            active={phone.bookmarked}
            onClick={phone.onBookmark}
          />
        </div>
      ) : null}
    </div>
  );
}
