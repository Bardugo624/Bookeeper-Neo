import { useState } from 'react';
import { Button } from '@bookeeper/ui/base';
import { Menu, useToast, type MenuEntry } from '@bookeeper/ui/overlays';
import { useT } from '../../app';
import { ManageViewsDialog } from './ManageViewsDialog';
import { ViewNameDialog } from './ViewNameDialog';
import { useSavedViews } from './useSavedViews';

export interface SavedViewsProps {
  /** Address text of the combination on screen. */
  current: string;
  onApply(search: string): void;
}

/** The menu of saved views ("Views"), with "Save this view" and "Manage". */
export function SavedViews({ current, onApply }: SavedViewsProps) {
  const t = useT();
  const toast = useToast();
  const saved = useSavedViews();
  const [naming, setNaming] = useState(false);
  const [managing, setManaging] = useState(false);
  const items: MenuEntry[] = [
    ...saved.views.map((v): MenuEntry => ({ id: `view:${v.id}`, label: v.name, onSelect: () => onApply(v.search) })),
    ...(saved.views.length ? ([{ type: 'separator', id: 'sep' }] as MenuEntry[]) : []),
    { id: 'save', label: saved.full ? t('books.views.full') : t('books.views.save'), icon: 'plus', disabled: saved.full || current === '', onSelect: () => setNaming(true) },
    { id: 'manage', label: t('books.views.manage'), icon: 'pencil', disabled: saved.views.length === 0, onSelect: () => setManaging(true) },
  ];
  return (
    <>
      <Menu align="start" trigger={<Button variant="secondary">{t('books.views.button')}</Button>} items={items} />
      {naming ? (
        <ViewNameDialog
          open
          onCancel={() => setNaming(false)}
          onSave={(name) => {
            if (saved.save(name, current)) toast.show({ title: t('books.views.saved', { name: name.trim() }), tone: 'ok' });
            setNaming(false);
          }}
        />
      ) : null}
      <ManageViewsDialog
        open={managing}
        views={saved.views}
        onRename={saved.rename}
        onRemove={saved.remove}
        onClose={() => setManaging(false)}
      />
    </>
  );
}
