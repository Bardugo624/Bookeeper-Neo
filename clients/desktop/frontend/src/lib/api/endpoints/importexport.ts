/**
 * endpoints/importexport.ts — Import/Export libreria (roadmap 1.1).
 *
 * L'export CSV non è JSON: passa da ApiRequest raw invece che da api.get
 * (che farebbe JSON.parse del body).
 */
import { api } from '../client'
import {
  ApiRequest, PickImportFile, SaveExportFile, SaveLabelsPdf,
  GetBackupConfig, SetBackupConfig, ListLocalBackups, RunLocalBackup,
  GetLocalAdminPassword,
} from '../../../../wailsjs/go/main/App'
import { main } from '../../../../wailsjs/go/models'

export type ImportFormat = 'auto' | 'goodreads' | 'calibre' | 'librarything'

export interface ImportPreviewBook {
  title: string
  authors: string[]
  isbn_13?: string
  isbn_10?: string
  publisher?: string
  published_year?: number
}

export interface ImportResult {
  format: string
  total: number
  new: number
  duplicates: number
  invalid: number
  imported: number
  preview: ImportPreviewBook[]
  errors: string[]
}

export const importExportApi = {
  /** Dialog nativo: ritorna { name: '', content: '' } se annullato. */
  pickFile: () => PickImportFile(),

  import: (content: string, format: ImportFormat, dryRun: boolean) =>
    api.post<ImportResult>('/api/v1/import', { content, format, dry_run: dryRun }),

  exportRaw: (format: 'json' | 'csv') =>
    ApiRequest('GET', `/api/v1/export?format=${format}`, ''),

  /** Dialog di salvataggio: ritorna il path scritto, '' se annullato. */
  saveFile: (defaultName: string, content: string) => SaveExportFile(defaultName, content),
}

// --- Backup & Restore (roadmap 1.2) ---

export interface RestoreResult {
  restored_rows: number
}

export const backupApi = {
  /** Dump JSON completo della libreria (stringa raw, pronta da salvare). */
  createRaw: () => ApiRequest('POST', '/api/v1/backup', ''),

  /** Restore distruttivo: backupJson è il contenuto del file di backup. */
  restore: (backupJson: string, adminPassword: string) =>
    api.post<RestoreResult>('/api/v1/restore', {
      admin_password: adminPassword,
      data: JSON.parse(backupJson),
    }),

  // Solo modalità locale:
  config: () => GetBackupConfig(),
  setConfig: (cfg: main.BackupConfig) => SetBackupConfig(cfg),
  list: () => ListLocalBackups(),
  runNow: () => RunLocalBackup(),
  localAdminPassword: () => GetLocalAdminPassword(),
}

// --- Etichette segnatura (PDF DataMatrix) ---

export const labelsApi = {
  /**
   * Genera il PDF delle etichette per i libri indicati e lo salva via dialog
   * nativo. Ritorna path='' se l'utente annulla. Lancia se nessuno dei libri
   * ha un numero progressivo.
   */
  savePdf: (bookIds: string[]): Promise<main.SaveLabelsResult> =>
    SaveLabelsPdf(main.SaveLabelsReq.createFrom({ book_ids: bookIds })),
}
