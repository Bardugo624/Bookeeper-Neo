import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Skeleton } from '@bookeeper/ui/base';
import { useT } from '../../../../app/i18n';
import { SettingsBlock } from '../../SettingsBlock';
import { useSettingsSession } from '../../useSettingsSession';
import { CopyButton } from './CopyButton';
import { PORT_MAX, PORT_MIN, parsePort, phraseWords } from './sharingModel';
import { useSharing } from './useSharing';
import styles from './SharingSection.module.css';

const PORT_ERRORS = {
  port_in_use: 'sharing.errors.portInUse',
  port_not_allowed: 'sharing.errors.portNotAllowed',
  bind_failed: 'sharing.errors.bindFailed',
} as const;

export function SharingSection() {
  const t = useT();
  const { me } = useSettingsSession();
  const { status, busy, failed, attempt, set } = useSharing();
  const [port, setPort] = useState('');
  const [portError, setPortError] = useState(false);

  useEffect(() => {
    if (status) setPort(String(status.port));
  }, [status?.port]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!status) {
    return failed ? (
      <p className={styles.error} role="alert">
        {t('sharing.loadFailed')}
      </p>
    ) : (
      <Skeleton />
    );
  }

  // Without an email the owner cannot have a password (the account page asks for one first).
  const noEmail = !me?.user.email;
  // A `password_required` read back on open is stale (the shell clears it only in `set`): only a fresh answer counts.
  const freshNoPassword = attempt !== null && status.error === 'password_required';
  const noPassword = noEmail || freshNoPassword;
  const on = status.enabled && status.running;

  const toggle = (next: boolean) => {
    if (next) {
      const parsed = parsePort(port);
      if (parsed === null) {
        setPortError(true);
        return;
      }
      setPortError(false);
      void set(true, parsed);
    } else {
      setPortError(false);
      void set(false);
    }
  };

  return (
    <>
      <SettingsBlock title={t('sharing.title')} description={t('sharing.description')}>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            role="switch"
            checked={on}
            disabled={busy || (noEmail && !on)}
            aria-busy={busy}
            onChange={(e) => toggle(e.target.checked)}
          />
          <span>{t('sharing.toggle')}</span>
        </label>
        <p className={styles.note}>
          {t('sharing.phones')} <Link to="/devices">{t('sharing.devicesLink')}</Link>
        </p>
        {noPassword && !on ? (
          <div className={styles.warning} role="note">
            <strong>{t('sharing.password.title')}</strong>
            <p>{t('sharing.password.text')}</p>
            <Link to="/settings/account">{t('sharing.password.link')}</Link>
          </div>
        ) : null}
        {failed ? (
          <p className={styles.error} role="alert">
            {t('sharing.failed')}
          </p>
        ) : null}
        {status.error === 'port_in_use' || status.error === 'port_not_allowed' || status.error === 'bind_failed' ? (
          <p className={styles.error} role="alert">
            {t(PORT_ERRORS[status.error], { port: status.attempted_port ?? attempt?.port ?? status.port })}
          </p>
        ) : null}
        {status.error === 'tls' ? (
          <p className={styles.error} role="alert">
            {t('sharing.errors.tls')}
          </p>
        ) : null}
        {on && status.error === 'mdns' ? (
          <p className={styles.note} role="status">
            {t('sharing.errors.mdns')}
          </p>
        ) : null}
      </SettingsBlock>

      <SettingsBlock title={t('sharing.port.title')} description={t('sharing.port.description')}>
        <div className={styles.portRow}>
          <label htmlFor="sharing-port">{t('sharing.port.label')}</label>
          <input
            id="sharing-port"
            className={styles.portInput}
            inputMode="numeric"
            value={port}
            disabled={on || busy}
            aria-invalid={portError}
            aria-describedby="sharing-port-hint"
            onChange={(e) => {
              setPort(e.target.value);
              setPortError(false);
            }}
          />
        </div>
        <p id="sharing-port-hint" className={portError ? styles.error : styles.note} role={portError ? 'alert' : undefined}>
          {portError ? t('sharing.port.error', { min: PORT_MIN, max: PORT_MAX }) : t('sharing.port.hint', { min: PORT_MIN, max: PORT_MAX })}
        </p>
      </SettingsBlock>

      {on ? (
        <SettingsBlock span="full" title={t('sharing.reach.title')} description={t('sharing.reach.description')}>
          <ul className={styles.list}>
            {status.addresses.map((a) => (
              <li key={a} className={styles.item}>
                <code>{a}</code>
                <CopyButton value={a} label={t('sharing.reach.copyAddress', { address: a })} />
              </li>
            ))}
          </ul>
          {status.phrase ? (
            <div className={styles.phraseBox}>
              <p className={styles.phraseTitle}>{t('sharing.phrase.title')}</p>
              <p className={styles.phrase} aria-label={t('sharing.phrase.label', { phrase: status.phrase })}>
                {phraseWords(status.phrase).map((w, i) => (
                  <span key={i} aria-hidden="true">
                    {w}
                  </span>
                ))}
              </p>
              <p className={styles.note}>{t('sharing.phrase.explain')}</p>
            </div>
          ) : null}
          {status.fingerprint ? (
            <details className={styles.details}>
              <summary>{t('sharing.fingerprint.summary')}</summary>
              <code className={styles.fingerprint}>{status.fingerprint}</code>
              <CopyButton value={status.fingerprint} label={t('sharing.fingerprint.copy')} />
            </details>
          ) : null}
        </SettingsBlock>
      ) : null}

      <SettingsBlock span="full" title={t('sharing.how.title')}>
        <ol className={styles.steps}>
          <li>{t('sharing.how.step1')}</li>
          <li>{t('sharing.how.step2', { add: t('devices.add.computer') })}</li>
          <li>{t('sharing.how.step3')}</li>
        </ol>
        <Link to="/devices">{t('sharing.devicesLink')}</Link>
      </SettingsBlock>
    </>
  );
}
