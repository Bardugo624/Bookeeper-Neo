import { useState } from 'react';
import { Button, Field, Input } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { apiErrorMessage, ListRow } from '../../kit';
import { useClient, useSession } from '../../session';
import styles from './Account.module.css';

const NAME_MAX = 80;

/** Library, name and role from `me`, and this phone's name with "Rinomina". */
export function WhoSection() {
  const t = useT();
  const client = useClient();
  const me = useSession((s) => s.me);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const start = () => {
    setDraft(me?.device.name ?? '');
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!me || saving) return;
    const name = draft.trim();
    if (!name) return setError(t('maccount.who.errors.empty'));
    if ([...name].length > NAME_MAX) return setError(t('maccount.who.errors.tooLong'));
    setSaving(true);
    setError(null);
    try {
      const device = await client.renameDevice(me.device.id, name);
      useSession.setState((s) => (s.me ? { me: { ...s.me, device: { ...s.me.device, name: device.name } } } : {}));
      setEditing(false);
    } catch (e) {
      setError(apiErrorMessage(t, e, { validation: t('maccount.who.errors.tooLong') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="account-who">
      <h2 id="account-who" className={styles.heading}>
        {t('maccount.who.title')}
      </h2>
      {me ? (
        <>
          <ListRow title={me.library.name} subtitle={t('maccount.who.library')} />
          <ListRow title={me.user.display_name} subtitle={t('maccount.who.name')} />
          <ListRow title={t(`maccount.who.roles.${me.user.role}`)} subtitle={t('maccount.who.role')} />
          {editing ? (
            <form
              className={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <Field label={t('maccount.who.renameLabel')} error={error ?? undefined}>
                <Input value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off" autoFocus />
              </Field>
              <div className={styles.actions}>
                <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                  {t('maccount.who.cancel')}
                </Button>
                <Button type="submit" variant="primary" loading={saving} loadingLabel={t('maccount.who.saving')}>
                  {t('maccount.who.save')}
                </Button>
              </div>
            </form>
          ) : (
            <ListRow
              title={me.device.name}
              subtitle={t('maccount.who.device')}
              trailing={
                <Button size="sm" variant="secondary" onClick={start}>
                  {t('maccount.who.rename')}
                </Button>
              }
            />
          )}
        </>
      ) : null}
    </section>
  );
}
