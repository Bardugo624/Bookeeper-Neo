import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReadingOut } from '@bookeeper/api';
import { useToast } from '@bookeeper/ui/overlays';
import type { ReaderBackend } from '../data';
import type { Relocation, Target } from '../engine/protocol';
import { decideResume, type LocalPosition, type ResumeSource } from '../model';
import { useReaderLocale, useReaderT } from '../i18n';
import type { Question } from '../ui/view';
import { percentPhrase } from '../ui/view/format';
import { chapterAtFraction, sinceText } from './helpers';
import type { Opened } from './useBookSession';

interface Input {
  backend: ReaderBackend;
  opened: Opened | null;
  relocation: Relocation | null;
  localAtOpen: LocalPosition | null;
  sources: ResumeSource[] | null;
  reading: ReadingOut | null;
  goTo: (target: Target) => void;
}

/**
 * The bottom bar's questions. «Continua da …» waits until the person chooses, and turning the page counts as
 * «Resta qui». At the last page «Segna come letto» asks, and only a click on it calls `markRead`.
 */
export function useQuestion({ backend, opened, relocation, localAtOpen, sources, reading, goTo }: Input) {
  const t = useReaderT();
  const locale = useReaderLocale();
  const toast = useToast();
  const [stayed, setStayed] = useState(false);
  const [endDone, setEndDone] = useState(false);
  const [marked, setMarked] = useState(false);

  const offer = useMemo(
    () => (sources && opened ? decideResume(localAtOpen, sources, backend.deviceId) : null),
    [sources, opened, localAtOpen, backend.deviceId],
  );
  const stay = useCallback(() => setStayed(true), []);
  const atEnd = relocation?.atEnd ?? false;
  // The question comes back only after the person has left the last page.
  useEffect(() => {
    if (!atEnd) setEndDone(false);
  }, [atEnd]);

  const resumeOpen = !!offer && !stayed;
  const question = useMemo<Question | null>(() => {
    if (offer && resumeOpen) {
      const percent = Math.round(offer.percent);
      const s = offer.source;
      const when = sinceText(locale, offer.at);
      const go = () => {
        setStayed(true);
        goTo(offer.target);
      };
      const actions = [
        { id: 'stay', label: t('reader.resume.stay'), onClick: stay },
        { id: 'go', label: percentPhrase(t, 'reader.resume.go', offer.percent, locale), onClick: go, primary: true },
      ];
      if (s.kind === 'page') {
        return { text: t('reader.resume.page', { page: s.page, percent }), detail: when, actions };
      }
      const chapter = opened ? chapterAtFraction(opened.toc, offer.percent / 100) : null;
      const texts: Record<string, string> = {
        mobile: t('reader.resume.question_mobile'),
        desktop: t('reader.resume.question_desktop'),
        koreader: t('reader.resume.question_koreader'),
        kobo: t('reader.resume.question_kobo'),
      };
      return {
        text: texts[s.deviceKind ?? ''] ?? t('reader.resume.question_other'),
        detail: [`${percent}%`, chapter, when].filter(Boolean).join(' · '),
        icon: s.deviceKind === 'mobile' ? 'phone' : s.deviceKind === 'desktop' ? 'computer' : undefined,
        actions,
      };
    }
    if (atEnd && !endDone && reading?.status !== 'read' && !marked) {
      const mark = () => {
        setEndDone(true);
        backend
          .markRead()
          .then(() => {
            setMarked(true);
            toast.show({ title: t('reader.end.marked'), tone: 'ok' });
          })
          .catch(() => toast.show({ title: t('reader.end.failed'), tone: 'danger' }));
      };
      return {
        text: t('reader.end.question'),
        actions: [
          { id: 'later', label: t('reader.end.not_yet'), onClick: () => setEndDone(true) },
          { id: 'read', label: t('reader.end.mark_read'), onClick: mark, primary: true },
        ],
      };
    }
    return null;
  }, [offer, resumeOpen, atEnd, endDone, marked, reading, opened, locale, t, stay, goTo, backend, toast]);

  return { question, resumeOpen, stay };
}
