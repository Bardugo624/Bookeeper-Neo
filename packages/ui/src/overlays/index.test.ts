import { expect, it } from 'vitest';
import { Dialog, Drawer, Menu, PillTabs, Popover, Select, ToastProvider, Tooltip, useToast } from '@bookeeper/ui/overlays';

it('exports the public surface from the package entry point', () => {
  for (const part of [Dialog, Drawer, Menu, PillTabs, Popover, Select, ToastProvider, Tooltip, useToast]) {
    expect(typeof part).toBe('function');
  }
});
