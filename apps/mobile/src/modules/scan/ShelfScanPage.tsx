import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { EmptyState, Icon } from '@bookeeper/ui/base';
import { useT } from '../../app/i18n';
import { Screen } from '../../kit';
import { useSession } from '../../session';
import { ShelfPicker, type PickedRow } from './ShelfPicker';
import { ShelfSession } from './ShelfSession';
import { ShelfSummary } from './ShelfSummary';
import type { SessionState } from './shelfReducer';
import { useShelfList } from './useShelfPick';
import styles from './Shelf.module.css';

function Body() {
  const navigate = useNavigate();
  const shelves = useShelfList();
  const [picked, setPicked] = useState<PickedRow | null>(null);
  const [done, setDone] = useState<SessionState | null>(null);
  const finish = useCallback((state: SessionState) => setDone(state), []);

  if (picked && done) {
    return (
      <ShelfSummary
        state={done}
        onAgain={() => {
          setDone(null);
          setPicked(null);
        }}
        onClose={() => navigate('/scan')}
      />
    );
  }
  if (picked) return <ShelfSession picked={picked} shelves={shelves.data ?? []} onDone={finish} />;
  return <ShelfPicker onPick={setPicked} />;
}

/** `/scan/shelf`: fill one row by scanning the books in the order they stand. */
export function ShelfScanPage() {
  const t = useT();
  const role = useSession((s) => s.me?.user.role);
  const canWrite = role !== undefined && role !== 'guest';
  return (
    <Screen
      title={t('mscan.shelf.title')}
      leading={
        <Link to="/scan" className={styles.back} aria-label={t('mscan.shelf.back')}>
          <Icon name="chevron-left" size={22} />
        </Link>
      }
    >
      {canWrite ? (
        <Body />
      ) : (
        <EmptyState icon="alert" title={t('mscan.shelf.needPermission.title')} text={t('mscan.shelf.needPermission.text')} />
      )}
    </Screen>
  );
}
