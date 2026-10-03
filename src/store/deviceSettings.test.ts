import { describe, expect, it } from 'vitest';
import { DEVICE_KEY, LEGACY_KEY, loadDeviceSettings, saveDeviceSettings } from './deviceSettings';
import { createDefaultData } from './defaults';
import { T0 } from '../test/fixtures';

describe('device settings', () => {
  it('falls back to defaults', () => {
    expect(loadDeviceSettings(T0)).toEqual(createDefaultData(T0).settings);
  });

  it('saves and loads', () => {
    saveDeviceSettings({ ...createDefaultData(T0).settings, theme: 'light', sfxVolume: 0.2 });
    expect(loadDeviceSettings(T0)).toMatchObject({ theme: 'light', sfxVolume: 0.2 });
  });

  it('migrates settings from the legacy local board once', () => {
    const legacy = createDefaultData(T0);
    legacy.settings.musicOn = true;
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ state: { data: legacy }, version: 1 }));
    expect(loadDeviceSettings(T0).musicOn).toBe(true);
  });

  it('ignores garbage', () => {
    localStorage.setItem(DEVICE_KEY, '{nope');
    expect(loadDeviceSettings(T0).theme).toBe('dark');
  });
});
