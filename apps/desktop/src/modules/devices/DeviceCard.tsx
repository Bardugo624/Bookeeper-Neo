import { Icon, IconButton, Tag } from '@bookeeper/ui/base';
import type { DeviceOut } from '@bookeeper/api';
import { useLocale, useT } from '../../app';
import { formatDate, formatRelativeDays } from '../../kit';
import { KIND_ICONS } from './model';
import styles from './DeviceCard.module.css';

export interface DeviceCardProps {
  device: DeviceOut;
  /** Rename and revoke, or null when the card is read-only. */
  actions: { onRename(): void; onRevoke(): void } | null;
}

export function DeviceCard({ device, actions }: DeviceCardProps) {
  const t = useT();
  const locale = useLocale();
  const revoked = device.revoked_at != null;
  const seen =
    device.last_seen != null
      ? t('devices.card.lastSeen', { when: formatRelativeDays(locale, device.last_seen) })
      : t('devices.card.neverSeen');

  return (
    <li className={`${styles.card} ${revoked ? styles.revoked : ''}`}>
      <span className={styles.icon} aria-hidden="true">
        <Icon name={KIND_ICONS[device.kind]} size={22} />
      </span>
      <div className={styles.body}>
        <div className={styles.top}>
          <h3 className={styles.name}>{device.name}</h3>
          {device.current ? <Tag tone="primary">{t('devices.card.current')}</Tag> : null}
          {revoked ? <Tag tone="danger">{t('devices.card.revoked')}</Tag> : null}
        </div>
        <p className={styles.meta}>
          <span>{t(`devices.kind.${device.kind}`)}</span>
          <span>{seen}</span>
          {revoked ? <span>{t('devices.card.revokedOn', { date: formatDate(locale, device.revoked_at!) })}</span> : null}
        </p>
      </div>
      {actions && !revoked ? (
        <div className={styles.actions}>
          <IconButton icon="pencil" size="sm" label={t('devices.card.rename', { name: device.name })} onClick={actions.onRename} />
          <IconButton icon="trash" size="sm" label={t('devices.card.revoke', { name: device.name })} onClick={actions.onRevoke} />
        </div>
      ) : null}
    </li>
  );
}
