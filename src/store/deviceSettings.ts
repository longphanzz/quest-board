import type { Settings } from '../types';
import { createSettings } from './defaults';
import { pickSettings } from './persistence';

export const DEVICE_KEY = 'quest-board-device-v1';
/** The pre-cloud local board; only read for migration and the first-sync prompt. */
export const LEGACY_KEY = 'quest-board-v1';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadDeviceSettings(now: Date = new Date()): Settings {
  const own = readJson(DEVICE_KEY);
  if (isObj(own)) return { ...createSettings(now), ...pickSettings(own) };
  const legacy = readJson(LEGACY_KEY);
  const legacySettings = isObj(legacy) && isObj(legacy.state) && isObj(legacy.state.data) ? legacy.state.data.settings : null;
  return { ...createSettings(now), ...(isObj(legacySettings) ? pickSettings(legacySettings) : {}) };
}

export function saveDeviceSettings(settings: Settings): void {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(settings));
  } catch {
    /* settings are a convenience; ignore quota errors */
  }
}
