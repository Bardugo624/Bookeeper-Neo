import { Button } from '@bookeeper/ui/base';
import { useT } from '../../../../app/i18n';
import { isKnownAction, type AuditFilters as Filters } from './auditModel';
import type { Option } from './useAuditData';
import styles from './AuditSection.module.css';

interface Props {
  values: Filters;
  people: Option[];
  devices: Option[];
  actions: string[];
  onChange(patch: Partial<Filters>): void;
  onReset(): void;
}

/** Person, device, action and date range; everything lives in the address. */
export function AuditFilters({ values, people, devices, actions, onChange, onReset }: Props) {
  const t = useT();
  const withCurrent = (list: Option[], value: string) => (value && !list.some((o) => o.value === value) ? [...list, { value, label: value }] : list);
  const actionOptions = withCurrent(
    actions.map((a) => ({ value: a, label: isKnownAction(a) ? t(`audit.actions.${a}`) : a })),
    values.action,
  );
  const active = Object.values(values).some(Boolean);

  const select = (id: keyof Filters, label: string, any: string, options: Option[]) => (
    <label className={styles.field}>
      <span>{label}</span>
      <select value={values[id]} onChange={(e) => onChange({ [id]: e.target.value })}>
        <option value="">{any}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form className={styles.filters} role="search" aria-label={t('audit.filters.label')} onSubmit={(e) => e.preventDefault()}>
      {select('user', t('audit.filters.user'), t('audit.filters.any'), withCurrent(people, values.user))}
      {select('device', t('audit.filters.device'), t('audit.filters.anyDevice'), withCurrent(devices, values.device))}
      {select('action', t('audit.filters.action'), t('audit.filters.any'), actionOptions)}
      <label className={styles.field}>
        <span>{t('audit.filters.from')}</span>
        <input type="date" value={values.from} max={values.to || undefined} onChange={(e) => onChange({ from: e.target.value })} />
      </label>
      <label className={styles.field}>
        <span>{t('audit.filters.to')}</span>
        <input type="date" value={values.to} min={values.from || undefined} onChange={(e) => onChange({ to: e.target.value })} />
      </label>
      <Button variant="ghost" disabled={!active} onClick={onReset}>
        {t('audit.filters.reset')}
      </Button>
    </form>
  );
}
