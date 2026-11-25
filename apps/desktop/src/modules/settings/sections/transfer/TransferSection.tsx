import { usePermission } from '../../../../kit';
import { ExportBlock } from './ExportBlock';
import { ImportBlock } from './ImportBlock';

/** Import is for admins; export for every member. */
export function TransferSection() {
  const { can } = usePermission();
  return (
    <>
      {can('admin') ? <ImportBlock /> : null}
      <ExportBlock />
    </>
  );
}
