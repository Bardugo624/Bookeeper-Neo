import { describe, expect, it, vi } from 'vitest';
import { browserCamera } from './camera';
import { deviceNameFromUserAgent } from './deviceName';
import { createBarcodeScanner, type BarcodeDetectorCtor } from './scanner';
import { browserServiceWorker } from './serviceWorker';
import { browserStorage, memoryStorage } from './storage';

describe('storage', () => {
  it('keeps values in localStorage', () => {
    const s = browserStorage();
    s.set('k', 'v');
    expect(localStorage.getItem('k')).toBe('v');
    s.remove('k');
    expect(s.get('k')).toBeNull();
  });

  it('falls back to memory when localStorage refuses writes', () => {
    const s = browserStorage();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    s.set('only-memory', '1');
    spy.mockRestore();
    expect(s.get('only-memory')).toBe('1');
  });

  it('has an in-memory twin for tests', () => {
    const s = memoryStorage();
    s.set('a', '1');
    expect(s.get('a')).toBe('1');
  });
});

describe('service worker', () => {
  it('announces a waiting version, to late listeners too, and reloads only on apply', async () => {
    const update = vi.fn(async () => undefined);
    let onNeedRefresh: (() => void) | undefined;
    const register = vi.fn((o: { onNeedRefresh?: () => void }) => {
      onNeedRefresh = o.onNeedRefresh;
      return update;
    });
    const sw = browserServiceWorker(register);
    const early = vi.fn();
    sw.onUpdateReady(early);
    sw.register();
    sw.register();
    expect(register).toHaveBeenCalledTimes(1);
    expect(early).not.toHaveBeenCalled();
    onNeedRefresh?.();
    expect(early).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    sw.onUpdateReady(late);
    expect(late).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    await sw.applyUpdate();
    expect(update).toHaveBeenCalledWith(true);
  });
});

describe('barcode scanner', () => {
  it('uses BarcodeDetector when the browser has it', async () => {
    vi.useFakeTimers();
    const detect = vi.fn(async () => [{ rawValue: '9788804668237', format: 'ean_13' }]);
    const Detector = vi.fn(() => ({ detect })) as unknown as BarcodeDetectorCtor;
    const zxing = vi.fn();
    const scanner = createBarcodeScanner({ detector: Detector, zxing });
    expect(scanner.engine).toBe('native');
    const onResult = vi.fn();
    const video = { readyState: 4 } as HTMLVideoElement;
    const stop = scanner.start(video, onResult);
    await vi.advanceTimersByTimeAsync(0);
    expect(Detector).toHaveBeenCalledWith({ formats: ['ean_13', 'ean_8', 'upc_a', 'qr_code'] });
    expect(onResult).toHaveBeenCalledWith({ text: '9788804668237', format: 'ean_13' });
    stop();
    expect(zxing).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('falls back to ZXing without it', async () => {
    const stopZxing = vi.fn();
    const zxing = vi.fn(async (_v: HTMLVideoElement, onResult: (r: { text: string; format: 'qr_code' }) => void) => {
      onResult({ text: 'hello', format: 'qr_code' });
      return { stop: stopZxing };
    });
    const scanner = createBarcodeScanner({ detector: undefined, zxing });
    expect(scanner.engine).toBe('zxing');
    const onResult = vi.fn();
    const stop = scanner.start({} as HTMLVideoElement, onResult);
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith({ text: 'hello', format: 'qr_code' }));
    stop();
    expect(stopZxing).toHaveBeenCalled();
  });
});

describe('camera', () => {
  function media(torch: boolean) {
    const track = {
      getCapabilities: () => (torch ? { torch: true } : {}),
      getSettings: () => ({ deviceId: 'cam-back' }),
      applyConstraints: vi.fn(async () => undefined),
      stop: vi.fn(),
    };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => stream);
    const enumerateDevices = vi.fn(async () => [
      { kind: 'videoinput', deviceId: 'cam-back', label: 'Back' },
      { kind: 'audioinput', deviceId: 'mic', label: 'Mic' },
    ]);
    return { track, getUserMedia, devices: { getUserMedia, enumerateDevices } as unknown as MediaDevices };
  }

  it('asks for the rear camera and drives the torch when there is one', async () => {
    const m = media(true);
    const session = await browserCamera(m.devices).open();
    expect(m.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    expect(session.torchSupported).toBe(true);
    await session.setTorch(true);
    expect(m.track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] });
    session.stop();
    expect(m.track.stop).toHaveBeenCalled();
  });

  it('reports no torch and lists only video devices', async () => {
    const m = media(false);
    const camera = browserCamera(m.devices);
    expect((await camera.open('cam-back')).torchSupported).toBe(false);
    expect(m.getUserMedia).toHaveBeenCalledWith({ video: { deviceId: { exact: 'cam-back' } }, audio: false });
    expect(await camera.devices()).toEqual([{ id: 'cam-back', label: 'Back' }]);
  });
});

describe('device name', () => {
  it('names the phone and the browser', () => {
    expect(
      deviceNameFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'),
    ).toBe('iPhone · Safari');
    expect(deviceNameFromUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36')).toBe(
      'Pixel 8 · Chrome',
    );
    expect(deviceNameFromUserAgent('', 'Telefono')).toBe('Telefono');
  });
});
