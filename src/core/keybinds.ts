export type ActionId =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'jump'
  | 'dash'
  | 'interact'
  | 'pulse'
  | 'pause';

export type Keybinds = Record<ActionId, string>;

export const ACTION_ORDER: readonly ActionId[] = [
  'moveUp',
  'moveDown',
  'moveLeft',
  'moveRight',
  'jump',
  'dash',
  'interact',
  'pulse',
  'pause'
] as const;

export const DEFAULT_KEYBINDS: Keybinds = {
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  jump: 'Space',
  dash: 'ShiftLeft',
  interact: 'KeyE',
  pulse: 'KeyQ',
  pause: 'Escape'
};

export const ACTION_LABELS: Record<ActionId, string> = {
  moveUp: 'Di chuyển lên',
  moveDown: 'Di chuyển xuống',
  moveLeft: 'Di chuyển trái',
  moveRight: 'Di chuyển phải',
  jump: 'Nhảy',
  dash: 'Lướt',
  interact: 'Tương tác (Nạp/Châm dầu)',
  pulse: 'Tỏa sáng',
  pause: 'Tạm dừng'
};

export function formatKeyCode(code: string): string {
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  switch (code) {
    case 'Space':
      return 'Space';
    case 'ShiftLeft':
    case 'ShiftRight':
      return 'Shift';
    case 'Escape':
      return 'Esc';
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    case 'ControlLeft':
    case 'ControlRight':
      return 'Ctrl';
    case 'AltLeft':
    case 'AltRight':
      return 'Alt';
    case 'Enter':
      return 'Enter';
    case 'Tab':
      return 'Tab';
    default:
      return code;
  }
}

export function rebindAction(
  current: Keybinds,
  action: ActionId,
  newCode: string
): { ok: true; binds: Keybinds } | { ok: false; conflictAction: ActionId; conflictLabel: string } {
  for (const other of ACTION_ORDER) {
    if (other !== action && current[other] === newCode) {
      return {
        ok: false,
        conflictAction: other,
        conflictLabel: ACTION_LABELS[other]
      };
    }
  }
  return {
    ok: true,
    binds: {
      ...current,
      [action]: newCode
    }
  };
}

export function sanitizeKeybinds(raw: unknown): Keybinds {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_KEYBINDS };
  const candidate = raw as Partial<Record<ActionId, unknown>>;
  const result: Keybinds = { ...DEFAULT_KEYBINDS };
  const seen = new Set<string>();
  for (const action of ACTION_ORDER) {
    const val = candidate[action];
    if (typeof val !== 'string' || !val.trim() || seen.has(val)) {
      return { ...DEFAULT_KEYBINDS };
    }
    seen.add(val);
    result[action] = val;
  }
  return result;
}
