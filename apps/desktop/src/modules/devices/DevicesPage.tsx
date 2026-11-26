import { Button, EmptyState, Skeleton } from '@bookeeper/ui/base';
import { useT } from '../../app';
import { ConfirmDialog, PageHeader, usePermission, ErrorState } from '../../kit';
import { DeviceCard } from './DeviceCard';
import { PairDialog } from './PairDialog';
import { PhoneNotice } from './PhoneNotice';
import { RenameDialog } from './RenameDialog';
import { POLL_MS, splitDevices } from './model';
import { useDeviceActions } from './useDeviceActions';
import { useDevices, useServerInfo } from './useDevices';
import { useArrivalWatch, usePairingFlow } from './usePairingFlow';
import styles from './DevicesPage.module.css';

export function DevicesPage() {
  const t = useT();
  const { can } = usePermission();
  const canPair = can('write');
  const flow = usePairingFlow();
  // The list refreshes on its own only while a pairing dialog waits for the new device.
  const { query, rename, revoke } = useDevices(flow.kind ? POLL_MS : false);
  const server = useServerInfo(canPair);
  useArrivalWatch(flow.kind, query.data, flow.close);
  const a = useDeviceActions(rename, revoke);

  const devices = query.data ?? [];
  const { active, revoked } = splitDevices(devices);
  const phoneUrl = server.data?.phone_ready ? (server.data.public_url ?? undefined) : undefined;
  const dialog = a.dialog;
  const card = (d: (typeof devices)[number]) => (
    <DeviceCard key={d.id} device={d} actions={{ onRename: () => a.setDialog({ kind: 'rename', device: d }), onRevoke: () => a.setDialog({ kind: 'revoke', device: d }) }} />
  );

  let body;
  if (query.isPending) {
    body = (
      <div role="status" aria-label={t('devices.loading')} className={styles.list}>
        {[0, 1].map((i) => (
          <Skeleton key={i} height={72} />
        ))}
      </div>
    );
  } else if (query.isError) {
    body = (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    );
  } else {
    body = (
      <>
        <ul className={styles.list} aria-label={t('devices.title')}>
          {active.map(card)}
        </ul>
        {revoked.length > 0 ? (
          <details className={styles.revokedBox}>
            <summary>{t('devices.revokedSection', { count: revoked.length })}</summary>
            <ul className={styles.list}>{revoked.map(card)}</ul>
          </details>
        ) : null}
      </>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('devices.title')}
        count={query.data ? t('devices.count', { count: active.length }) : undefined}
        actions={
          canPair ? (
            <div className={styles.actions}>
              <Button variant="primary" icon="monitor" onClick={() => flow.open('computer')}>
                {t('devices.add.computer')}
              </Button>
              {phoneUrl ? (
                <Button variant="secondary" icon="phone" onClick={() => flow.open('phone')}>
                  {t('devices.add.phone')}
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      />
      {canPair && server.data && !server.data.phone_ready ? <PhoneNotice /> : null}
      {a.error ? (
        <p role="alert" className={styles.error}>
          {a.error}
        </p>
      ) : null}
      {body}
      {flow.kind ? <PairDialog key={flow.kind} phoneUrl={flow.kind === 'phone' ? phoneUrl : undefined} onClose={flow.close} /> : null}
      {dialog?.kind === 'rename' ? (
        <RenameDialog key={dialog.device.id} device={dialog.device} save={(name) => a.saveName(dialog.device, name)} onClose={() => a.setDialog(null)} />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'revoke'}
        title={t('devices.revoke.title')}
        description={
          dialog?.kind === 'revoke'
            ? t(dialog.device.current ? 'devices.revoke.currentDescription' : 'devices.revoke.description', { name: dialog.device.name })
            : ''
        }
        confirmLabel={t('devices.revoke.confirm')}
        tone="danger"
        busy={a.revoking}
        onConfirm={() => dialog?.kind === 'revoke' && void a.confirmRevoke(dialog.device)}
        onCancel={() => a.setDialog(null)}
      />
      {a.passwordDialog}
    </div>
  );
}
