import { Button, Tag, Icon } from '@bookeeper/ui/base';
import { PillTabs } from '@bookeeper/ui/overlays';
import { useT } from '../../app/i18n';
import { InviteStep } from './InviteStep';
import { FingerprintDialog } from './FingerprintDialog';
import { Notice } from './Notice';
import { PathCard } from './PathCard';
import { TextField } from './TextField';
import { useJoin } from './useJoin';
import type { FoundServer } from './useDiscover';
import type { PathId } from './types';
import styles from './form.module.css';

export interface JoinCardProps {
  open: boolean;
  onOpen: () => void;
  found: FoundServer[];
  goTo: (path: PathId) => void;
}

export function JoinCard({ open, onOpen, found, goTo }: JoinCardProps) {
  const t = useT();
  const s = useJoin();
  const badge =
    found.length > 0 ? (
      <Tag tone="primary">
        <Icon name="wifi" size={12} /> {t('welcome.join.found', { count: found.length })}
      </Tag>
    ) : null;

  return (
    <PathCard id="join" icon="link" title={t('welcome.join.title')} text={t('welcome.join.text')} badge={badge} open={open} onOpen={onOpen}>
      {s.invite ? (
        <InviteStep s={s} info={s.invite} />
      ) : s.choice ? (
        <div className={styles.form}>
          <p className={styles.hint}>{t('welcome.join.chooseTitle')}</p>
          <ul className={styles.list}>
            {s.choice.map((library) => (
              <li key={library.id}>
                <button type="button" className={styles.item} disabled={s.busy} onClick={() => s.choose(library)}>
                  {t('welcome.join.choose', { library: library.name })}
                </button>
              </li>
            ))}
          </ul>
          {s.errors.form || s.errors.password ? <Notice text={s.errors.form ?? s.errors.password ?? ''} /> : null}
          <div className={styles.actions}>
            <Button variant="ghost" disabled={s.busy} onClick={s.leaveChoice}>
              {t('welcome.join.chooseBack')}
            </Button>
          </div>
        </div>
      ) : (
        <form ref={s.formRef} className={styles.form} onSubmit={s.submit} noValidate>
          {found.length > 0 ? (
            <ul className={styles.list} aria-label={t('welcome.join.foundList')}>
              {found.map((server) => (
                <li key={server.key}>
                  <button type="button" className={styles.item} disabled={s.busy} onClick={() => s.setValue('address', server.address)}>
                    {server.name}
                    <span className={styles.itemSub}>{server.address}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <TextField
            name="address"
            label={t('welcome.fields.address')}
            hint={t('welcome.fields.addressHint')}
            value={s.values.address}
            onChange={(v) => s.setValue('address', v)}
            error={s.errors.address}
            disabled={s.busy}
            type="url"
          />
          <PillTabs
            variant="segmented"
            size="sm"
            label={t('welcome.join.mode')}
            value={s.mode}
            onChange={(id) => s.setMode(id === 'account' ? 'account' : 'code')}
            items={[
              { id: 'code', label: t('welcome.join.modeCode') },
              { id: 'account', label: t('welcome.join.modeAccount') },
            ]}
          />
          {s.mode === 'code' ? (
            <TextField
              name="code"
              label={t('welcome.fields.code')}
              hint={t('welcome.fields.codeHint')}
              value={s.values.code}
              onChange={(v) => s.setValue('code', v)}
              error={s.errors.code}
              disabled={s.busy}
            />
          ) : (
            <div className={styles.row}>
              <TextField
                name="email"
                type="email"
                label={t('welcome.fields.email')}
                value={s.values.email}
                onChange={(v) => s.setValue('email', v)}
                error={s.errors.email}
                disabled={s.busy}
                autoComplete="email"
              />
              <TextField
                name="password"
                type="password"
                label={t('welcome.fields.password')}
                value={s.values.password}
                onChange={(v) => s.setValue('password', v)}
                error={s.errors.password}
                disabled={s.busy}
                autoComplete="current-password"
              />
            </div>
          )}
          {s.errors.form ? <Notice text={s.errors.form} /> : null}
          {s.redirect ? <Notice text={s.redirect.text} action={{ label: s.redirect.action, onClick: () => goTo(s.redirect!.to) }} /> : null}
          <div className={styles.actions}>
            <Button type="submit" variant="primary" loading={s.busy} loadingLabel={t('welcome.probe.checking')}>
              {t('welcome.join.submit')}
            </Button>
          </div>
        </form>
      )}
      <FingerprintDialog phrase={s.phrase} onConfirm={s.confirmPhrase} onCancel={s.cancelPhrase} />
    </PathCard>
  );
}
