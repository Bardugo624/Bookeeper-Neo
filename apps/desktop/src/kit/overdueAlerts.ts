import { create } from 'zustand';

export const OVERDUE_ALERTS_KEY = 'bookeeper.overdueAlerts';

/** On unless the user turned it off; unreadable storage behaves like the default. */
export function readOverdueAlerts(): boolean {
  try {
    return localStorage.getItem(OVERDUE_ALERTS_KEY) !== 'off';
  } catch {
    return true;
  }
}

function saveOverdueAlerts(enabled: boolean): void {
  try {
    localStorage.setItem(OVERDUE_ALERTS_KEY, enabled ? 'on' : 'off');
  } catch {
    // The choice still applies for this run.
  }
}

interface AlertsState {
  enabled: boolean;
  setEnabled(enabled: boolean): void;
}

const useAlertsStore = create<AlertsState>((set) => ({
  enabled: readOverdueAlerts(),
  setEnabled(enabled) {
    saveOverdueAlerts(enabled);
    set({ enabled });
  },
}));

/** Whether to notify about overdue loans, shared by every component that asks. */
export function useOverdueAlerts(): [boolean, (enabled: boolean) => void] {
  const enabled = useAlertsStore((s) => s.enabled);
  const setEnabled = useAlertsStore((s) => s.setEnabled);
  return [enabled, setEnabled];
}
