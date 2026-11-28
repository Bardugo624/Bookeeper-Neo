import type { AnnotationOut, PositionOut, PutAnnotation, PutPosition, ReadingOut } from '@bookeeper/api';
import type { OfflineQueue } from './queue';

/** What each app hands to the reader. Already bound to one book and one file. */
export interface ReaderBackend {
  deviceId: string;
  loadFile(signal: AbortSignal, onProgress: (fraction: number) => void): Promise<Blob>;
  listPositions(): Promise<PositionOut[]>;
  putPosition(body: PutPosition): Promise<void>;
  getReading(): Promise<ReadingOut | null>;
  markRead(): Promise<void>;
  listAnnotations(since?: number): Promise<AnnotationOut[]>;
  putAnnotation(id: string, body: PutAnnotation): Promise<AnnotationOut>;
  openExternal(url: string): void;
  saveText(fileName: string, text: string): Promise<void>;
  queue: OfflineQueue;
}

/** Whole seconds since the epoch, like every time the server stores. */
export type Clock = () => number;
