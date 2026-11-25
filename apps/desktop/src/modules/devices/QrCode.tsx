import { useMemo } from 'react';
import { qrMatrix } from './qr';
import styles from './QrCode.module.css';

export interface QrCodeProps {
  text: string;
  /** Accessible description of the image. */
  label: string;
}

/** A QR code drawn as one SVG path; the quiet zone is the white frame around it. */
export function QrCode({ text, label }: QrCodeProps) {
  const { size, path } = useMemo(() => qrMatrix(text), [text]);
  return (
    <svg role="img" aria-label={label} className={styles.qr} viewBox={`-2 -2 ${size + 4} ${size + 4}`} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={size + 4} height={size + 4} className={styles.paper} />
      <path d={path} className={styles.ink} />
    </svg>
  );
}
