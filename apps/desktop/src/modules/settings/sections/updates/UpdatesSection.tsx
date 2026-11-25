import { useState } from 'react';
import { Button } from '@bookeeper/ui/base';
import { PillTabs } from '@bookeeper/ui/overlays';
import { useLocale, useT } from '../../../../app/i18n';
import type { UpdateChannel } from '../../../../platform';
import { UpdateDialog } from '../../../updates/UpdateDialog';
import { useUpdates } from '../../../updates/useUpdates';
import { APP_VERSION } from '../../appVersion';
import { Fact, FactList, SettingsBlock } from '../../SettingsBlock';
import styles from './UpdatesSection.module.css';

export function UpdatesSection() {
  const t = useT();
  const locale = useLocale();
  const updates = useUpdates();
  const [open, setOpen] = useState(false);
  const { channel, result, checking, lastCheck, controller } = updates;
  if (!updates.enabled || !controller) return null;

  let status: string;
  if (checking) status = t('updates.settings.checking');
  else if (result?.state === 'up_to_date') status = t('updates.settings.upToDate');
  else if (result?.state === 'available') status = t('updates.settings.available', { version: result.version });
  else if (result?.state === 'error') status = t(`updates.errors.${result.code}`);
  else status = t('updates.settings.unknown');

  const last = lastCheck === null ? t('updates.settings.never') : new Date(lastCheck).toLocaleString(locale);

  return (
    <SettingsBlock title={t('updates.settings.title')} description={t('updates.settings.description')}>
      <FactList>
        <Fact label={t('updates.settings.installed')}>{APP_VERSION}</Fact>
        <Fact label={t('updates.settings.lastCheck')}>{last}</Fact>
        <Fact label={t('updates.settings.status')}>
          <span role={result?.state === 'error' ? 'alert' : undefined}>{status}</span>
        </Fact>
      </FactList>
      <div className={styles.row}>
        <span className={styles.label}>{t('updates.settings.channel')}</span>
        <PillTabs
          size="sm"
          label={t('updates.settings.channelLabel')}
          value={channel}
          onChange={(id) => controller.setChannel(id as UpdateChannel)}
          items={[
            { id: 'stable', label: t('updates.settings.stable') },
            { id: 'beta', label: t('updates.settings.beta') },
          ]}
        />
      </div>
      {channel === 'beta' ? (
        <p className={styles.warning} role="note">
          {t('updates.settings.betaWarning')}
        </p>
      ) : null}
      <div className={styles.row}>
        <Button
          loading={checking}
          loadingLabel={t('updates.settings.checking')}
          disabled={updates.installing}
          onClick={() => void controller.check()}
        >
          {t('updates.settings.check')}
        </Button>
        {result?.state === 'available' ? (
          <Button variant="ghost" onClick={() => setOpen(true)}>
            {t('updates.settings.notes')}
          </Button>
        ) : null}
      </div>
      <UpdateDialog open={open} onOpenChange={setOpen} updates={updates} />
    </SettingsBlock>
  );
}
