/** What the core accepts for a cover upload (`covers::MAX_BYTES`, JPEG/PNG/WebP). */
export const COVER_MAX_BYTES = 5 * 1024 * 1024;
export const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type CoverFileProblem = 'type' | 'size';

export function coverFileProblem(file: Pick<File, 'type' | 'size'>): CoverFileProblem | null {
  if (!(COVER_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size > COVER_MAX_BYTES) return 'size';
  return null;
}

/** The bytes of a chosen file (`FileReader` also exists where `Blob.arrayBuffer` does not). */
export function readFileBytes(file: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}
