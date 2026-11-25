import QRCode from 'qrcode';

export interface QrMatrix {
  size: number;
  /** SVG path: one square per dark module. */
  path: string;
}

/** Encodes `text` locally and returns the dark modules as one SVG path. */
export function qrMatrix(text: string): QrMatrix {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  let path = '';
  for (let y = 0; y < modules.size; y += 1) {
    for (let x = 0; x < modules.size; x += 1) {
      if (modules.get(y, x)) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { size: modules.size, path };
}
