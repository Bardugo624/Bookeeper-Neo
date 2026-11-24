import { P, S, filenameOf, okRaw, parseJsonRaw, raw, unwrap, type Transport } from './util';

export type ConfirmOut = S['ConfirmOut'];
export type ConfirmRequest = S['ConfirmRequest'];
export type RestoreReport = S['RestoreReport'];
export type BackupList = S['BackupList'];
export type BackupItem = S['BackupItem'];
export type BackupConfig = S['BackupConfig'];

export function backupApi(t: Transport) {
  return {
    async confirm(password?: string) {
      return unwrap<ConfirmOut>(await t.request('POST', `${P}/auth/confirm`, password === undefined ? {} : { password }));
    },
    async createBackup() {
      const r = okRaw(await raw(t, { method: 'POST', path: `${P}/backup` }));
      return { bytes: r.bytes, filename: filenameOf(r, 'bookeeper-backup.zip') };
    },
    async restoreBackup(bytes: Uint8Array, confirmToken: string) {
      const r = await raw(t, {
        method: 'POST',
        path: `${P}/restore`,
        body: bytes,
        contentType: 'application/zip',
        headers: { 'X-Confirm-Token': confirmToken },
      });
      return parseJsonRaw<RestoreReport>(r);
    },
    async listBackups() {
      return unwrap<BackupList>(await t.request('GET', `${P}/backups`));
    },
    async getBackupConfig() {
      return unwrap<BackupConfig>(await t.request('GET', `${P}/backups/config`));
    },
    async setBackupConfig(config: BackupConfig) {
      return unwrap<BackupConfig>(await t.request('PUT', `${P}/backups/config`, config));
    },
  };
}
