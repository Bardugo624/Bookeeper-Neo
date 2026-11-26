// The devices module is reached through its route; the pieces below are shared with the people module
// (an invitation is shown like a pairing code).
export { module } from './routes';
export { CodeBlock, type CodeBlockProps } from './CodeBlock';
export { QrCode, type QrCodeProps } from './QrCode';
export { useCountdown } from './useCountdown';
export { useServerInfo } from './useDevices';
export { pairingAddress, groupCode, formatCountdown } from './model';
