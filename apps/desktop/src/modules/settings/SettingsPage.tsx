import { Navigate, useParams } from 'react-router';
import { EmptyState } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { PageHeader, usePermission } from '../../kit';
import { usePlatform } from '../../platform';
import { SectionList } from './SectionList';
import { collectSections } from './sections';
import type { SettingsSection } from './types';
import styles from './SettingsPage.module.css';

export interface SettingsPageProps {
  /** Replaces the sections found on disk (tests). */
  sections?: (ctx: Parameters<typeof collectSections>[0]) => SettingsSection[];
}

export function SettingsPage({ sections = collectSections }: SettingsPageProps) {
  const t = useT();
  const { sectionId } = useParams();
  const { role } = usePermission();
  const platform = usePlatform();
  const list = sections({ role, platform: platform.kind });
  const first = list[0];
  const current = list.find((s) => s.id === sectionId);

  if (!first) {
    return <EmptyState icon="settings" title={t('settings.empty.title')} text={t('settings.empty.text')} />;
  }
  // `/settings` and unknown or hidden ids go to the first section.
  if (!current) return <Navigate to={`/settings/${first.id}`} replace />;

  return (
    <div className={styles.page}>
      <PageHeader title={t('settings.title')} />
      <div className={styles.body}>
        <SectionList sections={list} />
        <div className={styles.content} key={current.id}>
          {current.element}
        </div>
      </div>
    </div>
  );
}
