import { Button } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { CodeBlock } from './CodeBlock';
import { QrCode } from './QrCode';
import { pairingAddress } from './model';
import { useCountdown } from './useCountdown';
import { usePairingCode } from './usePairingCode';
import styles from './PairDialog.module.css';

export interface PairDialogProps {
  /** Public address of the server, given when pairing a phone (the QR points there). */
  phoneUrl?: string;
  onClose(): void;
}

/** Mounted only while open. Closing it does not revoke the code. */
export function PairDialog({ phoneUrl, onClose }: PairDialogProps) {
  const t = useT();
  const pairing = usePairingCode();
  const remaining = useCountdown(pairing.code?.expires_at ?? null);
  const code = pairing.code?.code;
  const phone = phoneUrl !== undefined;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t(phone ? 'devices.pair.phoneTitle' : 'devices.pair.computerTitle')}
      closeLabel={t('common.close')}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      }
    >
      <div className={styles.body}>
        {pairing.error ? (
          <p role="alert" className={styles.error}>
            {pairing.error}
          </p>
        ) : null}
        {code ? (
          <>
            {phone ? (
              <div className={`${styles.qr} ${remaining <= 0 ? styles.dim : ''}`}>
                <QrCode text={pairingAddress(phoneUrl, code)} label={t('devices.pair.qrLabel')} />
                <p className={styles.address}>{phoneUrl}</p>
              </div>
            ) : null}
            <CodeBlock code={code} remaining={remaining} regenerating={pairing.generating} onRegenerate={() => void pairing.generate()} />
          </>
        ) : pairing.error ? (
          <Button variant="primary" loading={pairing.generating} loadingLabel={t('devices.pair.generating')} onClick={() => void pairing.generate()}>
            {t('common.retry')}
          </Button>
        ) : (
          <p role="status">{t('devices.pair.generating')}</p>
        )}
        <ol className={styles.steps}>
          {[1, 2, 3].map((n) => (
            <li key={n}>{t(`devices.pair.${phone ? 'phoneSteps' : 'steps'}.${n}`)}</li>
          ))}
        </ol>
      </div>
    </Dialog>
  );
}
