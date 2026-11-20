export type Pos3 = [number, number, number];
export type NightNumber = 1 | 2 | 3;

export interface LanternDef {
  id: string;
  pos: Pos3;
}

export interface LaunchPadDef {
  id: string;
  pos: Pos3;
  radius: number;
  vy: number;
  vx: number;
  vz: number;
}

export interface CharmDef {
  id: string;
  pos: Pos3;
}

export interface NightMapConfig {
  night: NightNumber;
  name: string;
  subtitle: string;
  elderLine: string;
  durationS: number;
  spawnPos: Pos3;
  spawnFacing: [number, number];
  lanterns: LanternDef[];
  moteSpawns: Pos3[];
  shadeSpawns: Pos3[];
  shadeIntervalTicks: number;
  maxShades: number;
  shadeSpeed: number;
  driftersEnabled: boolean;
  windEnabled: boolean;
  launchPads: LaunchPadDef[];
  charms: CharmDef[];
}

function ringPoints(cx: number, cz: number, y: number, r: number, count: number, startDeg = 0): Pos3[] {
  const stepDeg = 360 / count;
  const pts: Pos3[] = [];
  for (let i = 0; i < count; i++) {
    const rad = ((startDeg + i * stepDeg) * Math.PI) / 180;
    pts.push([
      Math.round((cx + Math.cos(rad) * r) * 1000) / 1000,
      y,
      Math.round((cz + Math.sin(rad) * r) * 1000) / 1000
    ]);
  }
  return pts;
}

function degPoint(cx: number, cz: number, y: number, r: number, deg: number): Pos3 {
  const rad = (deg * Math.PI) / 180;
  return [
    Math.round((cx + Math.cos(rad) * r) * 1000) / 1000,
    y,
    Math.round((cz + Math.sin(rad) * r) * 1000) / 1000
  ];
}

function padToward(id: string, pos: Pos3, targetX: number, targetZ: number, horizSpeed: number, vy: number): LaunchPadDef {
  const dx = targetX - pos[0];
  const dz = targetZ - pos[2];
  const d = Math.hypot(dx, dz) || 1;
  return {
    id,
    pos,
    radius: 1,
    vy,
    vx: (dx / d) * horizSpeed,
    vz: (dz / d) * horizSpeed
  };
}

export const NIGHT_MAPS: Record<NightNumber, NightMapConfig> = {
  1: {
    night: 1,
    name: 'Đảo Bến',
    subtitle: 'Đêm 1 · Hòn đảo đầu tiên',
    elderLine: '“Sương đen đã nuốt lấy bờ bến. Hãy gom đom đóm và thắp lại năm ngọn đèn cũ.”',
    durationS: 300,
    spawnPos: [0, 0, 0],
    spawnFacing: [0, 1],
    lanterns: [
      { id: 'L1', pos: [0, 0, 25] },
      { id: 'L2', pos: [23.8, 0, 7.7] },
      { id: 'L3', pos: [14.7, 0, -20.2] },
      { id: 'L4', pos: [-14.7, 0, -20.2] },
      { id: 'L5', pos: [-23.8, 0, 7.7] }
    ],
    moteSpawns: [...ringPoints(0, 0, 0, 12, 8, 0), ...ringPoints(0, 0, 0, 33, 16, 0)],
    shadeSpawns: ringPoints(0, 0, 0, 37, 12, 15),
    shadeIntervalTicks: 480,
    maxShades: 6,
    shadeSpeed: 4.0,
    driftersEnabled: false,
    windEnabled: false,
    launchPads: [],
    charms: []
  },
  2: {
    night: 2,
    name: 'Đảo Cau',
    subtitle: 'Đêm 2 · Hai bờ cầu tre',
    elderLine: '“Cầu tre nối đôi bờ sương, nhưng cẩn thận Gió Lạc rình rập khi túi sáng đầy.”',
    durationS: 330,
    spawnPos: [0, 0, 0],
    spawnFacing: [0, 1],
    lanterns: [
      { id: 'L1', pos: [0, 0, 20] },
      { id: 'L2', pos: [17, 0, -10] },
      { id: 'L3', pos: [-17, 0, -10] },
      { id: 'L4', pos: [70, 0, 20] },
      { id: 'L5', pos: [87, 0, -10] },
      { id: 'L6', pos: [53, 0, -10] }
    ],
    moteSpawns: [
      ...ringPoints(0, 0, 0, 10, 4, 0),
      ...ringPoints(0, 0, 0, 22, 8, 0),
      ...ringPoints(70, 0, 0, 10, 4, 0),
      ...ringPoints(70, 0, 0, 22, 8, 0)
    ],
    shadeSpawns: [...ringPoints(0, 0, 0, 26, 8, 22.5), ...ringPoints(70, 0, 0, 26, 8, 22.5)],
    shadeIntervalTicks: 420,
    maxShades: 8,
    shadeSpeed: 4.0,
    driftersEnabled: true,
    windEnabled: false,
    launchPads: [
      padToward('P1', [20, 0, 18], 70, 0, 24, 14),
      padToward('P2', [50, 0, -18], 0, 0, 24, 14)
    ],
    charms: [{ id: 'C1', pos: [35, 0, 0] }]
  },
  3: {
    night: 3,
    name: 'Đảo Chuông',
    subtitle: 'Đêm 3 · Ba tầng tháp cổ',
    elderLine: '“Gió đêm đang nổi lên quanh tháp chuông. Thắp đủ bảy ngọn đèn để đón bình minh!”',
    durationS: 360,
    spawnPos: [0, 0, 0],
    spawnFacing: [0, 1],
    lanterns: [
      { id: 'L1', pos: [0, 6, 6] },
      { id: 'L2', pos: [18, 3, 10] },
      { id: 'L3', pos: [-18, 3, 10] },
      { id: 'L4', pos: [35, 0, -10] },
      { id: 'L5', pos: [-35, 0, -10] },
      { id: 'L6', pos: [20, 0, -35] },
      { id: 'L7', pos: [-20, 0, -35] }
    ],
    moteSpawns: [
      ...ringPoints(0, 0, 0, 34, 18, 0),
      ...[20, 40, 60, 80, 100, 120, 140, 160].map((d) => degPoint(0, 0, 3, 18, d)),
      ...[45, 135, 225, 315].map((d) => degPoint(0, 0, 6, 5, d))
    ],
    shadeSpawns: ringPoints(0, 0, 0, 43, 16, 0),
    shadeIntervalTicks: 360,
    maxShades: 10,
    shadeSpeed: 4.5,
    driftersEnabled: true,
    windEnabled: true,
    launchPads: [{ id: 'P1', pos: [0, 3, 13], radius: 1, vy: 12, vx: 0, vz: -8 }],
    charms: [
      { id: 'C1', pos: [30, 0, 25] },
      { id: 'C2', pos: [-30, 0, 25] }
    ]
  }
};

const RAMP_ANGLES = [(30 * Math.PI) / 180, (150 * Math.PI) / 180];

function night3RampHeight(x: number, z: number): number | null {
  for (const angle of RAMP_ANGLES) {
    const ux = Math.cos(angle);
    const uz = Math.sin(angle);
    const along = x * ux + z * uz;
    const perp = Math.abs(-x * uz + z * ux);
    if (perp <= 1.5 && along >= 23.85 && along <= 30) {
      return Math.min(3, Math.max(0, (3 * (30 - along)) / 6));
    }
  }
  return null;
}

/**
 * Returns the floor elevation at (x, z), or null if over the cloud sea (falling zone).
 * Returns Infinity for solid vertical obstacles (Night 3 bell tower).
 */
export function getGroundHeight(night: NightNumber, x: number, z: number): number | null {
  if (night === 1) {
    return Math.hypot(x, z) <= 40 ? 0 : null;
  }
  if (night === 2) {
    if (Math.hypot(x, z) <= 28) return 0;
    if (Math.hypot(x - 70, z) <= 28) return 0;
    if (x >= 26 && x <= 44 && z >= -2 && z <= 2) return 0;
    return null;
  }
  const r = Math.hypot(x, z);
  if (r < 2) return Infinity;
  if (r <= 8) return 6;
  if (r >= 12 && r <= 24 && z > 0) return 3;
  const rampH = night3RampHeight(x, z);
  if (rampH !== null) return rampH;
  if (r <= 45) return 0;
  return null;
}

export function isBlockedAtHeight(night: NightNumber, x: number, z: number, currentY: number, stepUpMax = 0.3): boolean {
  const h = getGroundHeight(night, x, z);
  if (h === null) return false;
  return h > currentY + stepUpMax;
}

export function isInsideShadeMap(night: NightNumber, x: number, z: number): boolean {
  const h = getGroundHeight(night, x, z);
  return h !== null && Number.isFinite(h);
}
