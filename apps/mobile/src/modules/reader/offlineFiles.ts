/**
 * Where the reader looks for a copy of the file kept on the phone before it asks the server.
 * The offline copy (OPFS, `opfsLibrary`) plugs in here.
 */
export interface OfflineFiles {
  /** The file kept on the phone, or `null` when there is none. */
  read(sha256: string, format: string): Promise<Blob | null>;
}

export const noOfflineFiles: OfflineFiles = { read: async () => null };
