import type { DeviceOut } from '@bookeeper/api';
import type { IconName } from '@bookeeper/ui/base';
import type { FormErrors } from '../../kit';

/** Limit enforced by the core (`crates/bookeeper-core/src/api/devices.rs`): 1 to 80 characters. */
export const LIMITS = { name: 80 } as const;

/** How often the list is refreshed while a pairing dialog is open. */
export const POLL_MS = 5000;

export const KIND_ICONS: Record<DeviceOut['kind'], IconName> = { desktop: 'monitor', mobile: 'phone' };

export interface RenameValues {
  name: string;
}

export function validateName(values: RenameValues): FormErrors<RenameValues> {
  const name = values.name.trim();
  if (name.length === 0) return { name: 'required' };
  if ([...name].length > LIMITS.name) return { name: 'tooLong' };
  return {};
}

/** Active devices first (as the core sorts them), revoked ones apart. */
export function splitDevices(devices: readonly DeviceOut[]): { active: DeviceOut[]; revoked: DeviceOut[] } {
  const active: DeviceOut[] = [];
  const revoked: DeviceOut[] = [];
  for (const d of devices) (d.revoked_at != null ? revoked : active).push(d);
  return { active, revoked };
}

/** The core returns eight plain characters; they are shown in two groups of four. */
export function groupCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1 ');
}

/** Address the phone opens: the PWA reads the code from the fragment (`#/pair?code=…`). */
export function pairingAddress(publicUrl: string, code: string): string {
  return `${publicUrl.replace(/\/+$/, '')}/#/pair?code=${encodeURIComponent(code)}`;
}

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
