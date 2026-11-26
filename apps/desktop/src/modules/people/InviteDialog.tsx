import { useState } from 'react';
import { Button } from '@bookeeper/ui/base';
import { Dialog } from '@bookeeper/ui/overlays';
import type { InviteCreated, InviteRole } from '@bookeeper/api';
import { useT } from '../../app';
import { FormDialog, apiErrorMessage, useFormState } from '../../kit';
import { CodeBlock, QrCode, pairingAddress, useCountdown } from '../devices';
import { INVITE_DAYS, DEFAULT_INVITE_DAYS, DEFAULT_INVITE_ROLE, type InviteDays } from './model';
import { RadioGroup } from './RadioGroup';
import styles from './InviteDialog.module.css';

export interface InviteDialogProps {
  roles: InviteRole[];
  /** Public HTTPS address of the server, when phones can use it (the QR points there). */
  phoneUrl?: string;
  create(body: { role: InviteRole; expires_in_days: number }): Promise<InviteCreated>;
  onClose(): void;
}

interface Values {
  role: InviteRole;
  days: InviteDays;
}

/** Mounted only while open: first the choices, then the code (and the QR when a phone can use it). */
export function InviteDialog({ roles, phoneUrl, create, onClose }: InviteDialogProps) {
  const t = useT();
  const [invite, setInvite] = useState<InviteCreated | null>(null);
  const form = useFormState<Values>({ role: roles.includes(DEFAULT_INVITE_ROLE) ? DEFAULT_INVITE_ROLE : roles[0]!, days: DEFAULT_INVITE_DAYS }, () => ({}));
  const remaining = useCountdown(invite?.expires_at ?? null);
  const submit = form.submit(async (v) => {
    setInvite(await create({ role: v.role, expires_in_days: v.days }));
  });

  if (invite) {
    return (
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        title={t('people.invite.codeTitle', { role: t(`people.roles.${invite.role}`) })}
        closeLabel={t('common.close')}
        footer={
          <div className={styles.footer}>
            <Button variant="primary" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        }
      >
        <div className={styles.body}>
          {phoneUrl ? (
            <div className={`${styles.qr} ${remaining <= 0 ? styles.dim : ''}`}>
              <QrCode text={pairingAddress(phoneUrl, invite.code)} label={t('people.invite.qrLabel')} />
              <p className={styles.address}>{phoneUrl}</p>
            </div>
          ) : null}
          <CodeBlock
            code={invite.code}
            remaining={remaining}
            regenerating={form.submitting}
            onRegenerate={() => void submit()}
          />
          <p className={styles.how}>{t('people.invite.how')}</p>
        </div>
      </Dialog>
    );
  }

  return (
    <FormDialog
      open
      title={t('people.invite.title')}
      submitLabel={t('people.invite.create')}
      error={form.submitError ? apiErrorMessage(t, form.submitError) : null}
      busy={form.submitting}
      onSubmit={(e) => void submit(e)}
      onCancel={onClose}
    >
      <RadioGroup
        legend={t('people.invite.role')}
        name="role"
        value={form.values.role}
        options={roles.map((r) => ({ value: r, label: t(`people.roles.${r}`) }))}
        onChange={(role) => form.setValue('role', role)}
      />
      <RadioGroup
        legend={t('people.invite.days')}
        name="days"
        value={form.values.days}
        options={INVITE_DAYS.map((d) => ({ value: d, label: t('people.invite.dayCount', { count: d }) }))}
        onChange={(days) => form.setValue('days', days)}
      />
    </FormDialog>
  );
}
