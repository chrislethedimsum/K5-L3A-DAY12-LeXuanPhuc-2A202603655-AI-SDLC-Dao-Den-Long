import { DEFAULT_KEYBINDS, sanitizeKeybinds, type Keybinds } from '../core/keybinds';

export interface GameSettings {
  volume: number;
  sensitivity: number;
  colorblind: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  keybinds: Keybinds;
}

const STORAGE_KEY = 'dao_den_long_settings_v1';

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

export function defaultSettings(): GameSettings {
  return {
    volume: 0.7,
    sensitivity: 1.0,
    colorblind: false,
    reducedMotion: prefersReducedMotion(),
    largeText: false,
    keybinds: { ...DEFAULT_KEYBINDS }
  };
}

export function loadSettings(): GameSettings {
  const defaults = defaultSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    const volume =
      typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
        ? Math.min(1, Math.max(0, parsed.volume))
        : defaults.volume;
    const sensitivity =
      typeof parsed.sensitivity === 'number' && Number.isFinite(parsed.sensitivity)
        ? Math.min(2, Math.max(0.3, parsed.sensitivity))
        : defaults.sensitivity;
    const colorblind = typeof parsed.colorblind === 'boolean' ? parsed.colorblind : defaults.colorblind;
    const reducedMotion = typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : defaults.reducedMotion;
    const largeText = typeof parsed.largeText === 'boolean' ? parsed.largeText : defaults.largeText;
    const keybinds = sanitizeKeybinds(parsed.keybinds);
    return { volume, sensitivity, colorblind, reducedMotion, largeText, keybinds };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors in restricted browser modes
  }
}
