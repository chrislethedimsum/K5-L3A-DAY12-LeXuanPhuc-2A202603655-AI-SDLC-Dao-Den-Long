export interface GameSettings {
  volume: number;
  sensitivity: number;
}

const STORAGE_KEY = 'dao_den_long_settings_v1';
const DEFAULTS: GameSettings = { volume: 0.7, sensitivity: 1.0 };

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    const volume = typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
      ? Math.min(1, Math.max(0, parsed.volume))
      : DEFAULTS.volume;
    const sensitivity = typeof parsed.sensitivity === 'number' && Number.isFinite(parsed.sensitivity)
      ? Math.min(2, Math.max(0.3, parsed.sensitivity))
      : DEFAULTS.sensitivity;
    return { volume, sensitivity };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors in restricted browser modes
  }
}
