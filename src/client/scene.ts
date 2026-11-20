import * as THREE from 'three';
import contract from '../core/contract';
import { NIGHT_MAPS, type NightNumber } from '../core/maps';
import type { GameEvent, HudState, Pos3, Snapshot } from '../core/types';

const T = contract.tuning;

const PALETTE = {
  sky: '#0E1430',
  fog: '#1B2350',
  dawnSky: '#3A284E',
  dawnMoon: '#FFE2AE',
  grass: '#2F5D50',
  sand: '#C9B48A',
  wood: '#6B4A2F',
  cloudSea: '#12384A',
  lanternLit: '#FFB347',
  lanternCore: '#FFE9B0',
  lanternUnlit: '#5B5F6E',
  moteCore: '#FFF6C2',
  moteHalo: '#FFE58A',
  shadeBody: '#120A1A',
  shadeRim: '#7A3CFF',
  shadeRimColorblind: '#00B3FF',
  shadeStunned: '#3A3450',
  mayRobe: '#E8E2D0',
  mayScarfAndCharm: '#C8102E',
  gold: '#F2C14E',
  danger: '#FF5A5F',
  drifter: '#8FA3B8'
};

const MAX_MOTES = 128;
const MAX_SHADES = 256;
const EMBER_COUNT = 40;

export interface ProjectedPoint {
  x: number;
  y: number;
  inFront: boolean;
  onScreen: boolean;
}

export class IslandScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 1, 0.1, 300);
  private player = new THREE.Group();
  private terrainGroup = new THREE.Group();
  private entities = new Map<string, THREE.Group>();
  private rings: { mesh: THREE.Mesh; age: number }[] = [];
  private leaves: THREE.Mesh[] = [];

  private moteCoreMesh: THREE.InstancedMesh;
  private moteHaloMesh: THREE.InstancedMesh;
  private shadeBodyMesh: THREE.InstancedMesh;
  private shadeRimMesh: THREE.InstancedMesh;
  private shadeEyeLMesh: THREE.InstancedMesh;
  private shadeEyeRMesh: THREE.InstancedMesh;
  private shadeRimMat: THREE.MeshBasicMaterial;
  private shadeEyeMat: THREE.MeshStandardMaterial;
  private dummy = new THREE.Object3D();
  private colorNormalShade = new THREE.Color(PALETTE.shadeBody);
  private colorStunnedShade = new THREE.Color(PALETTE.shadeStunned);

  private embersPos = new Float32Array(EMBER_COUNT * 3);
  private embersGeo = new THREE.BufferGeometry();
  private embersPoints: THREE.Points;

  private sky = new THREE.Color(PALETTE.sky);
  private fogBase = new THREE.Color(PALETTE.fog);
  private dawnColor = new THREE.Color(PALETTE.dawnSky);
  private moonColorBase = new THREE.Color(0xf5f1e6);
  private moonColorDawn = new THREE.Color(PALETTE.dawnMoon);
  private ambient = new THREE.HemisphereLight(0xf5f1e6, 0x1b2350, 0.15);
  private moon = new THREE.DirectionalLight(0xf5f1e6, 1.35);
  private builtNight: NightNumber | null = null;
  private colorblind = false;
  private reducedMotion = false;
  private benchMode = false;
  private shakeTime = 0;
  private shakeAmp = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.scene.background = this.sky;
    this.scene.fog = new THREE.FogExp2(PALETTE.fog, 0.007);
    this.scene.add(this.ambient);
    this.moon.position.set(-22, 46, -18);
    this.scene.add(this.moon);

    const sea = new THREE.Mesh(
      new THREE.CircleGeometry(240, 48),
      new THREE.MeshStandardMaterial({ color: PALETTE.cloudSea, roughness: 0.95 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(25, -11, 0);
    this.scene.add(sea);

    for (let i = 0; i < 28; i++) {
      const a = i * 2.39996;
      const r = 50 + (i % 7) * 9;
      const cloud = this.mesh(
        new THREE.IcosahedronGeometry(5 + (i % 4), 1),
        PALETTE.cloudSea,
        this.scene,
        25 + Math.cos(a) * r,
        -9 - (i % 3) * 1.5,
        Math.sin(a) * r
      );
      cloud.scale.set(2.0, 0.32, 1.1);
    }

    const stars: number[] = [];
    for (let i = 0; i < 200; i++) {
      const a = i * 2.39996;
      stars.push(25 + Math.cos(a) * 125, 24 + (i % 50), Math.sin(a) * 125);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
    this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: PALETTE.moteCore, size: 0.25 })));

    this.scene.add(this.terrainGroup);

    // Instanced Motes (2 draw calls total regardless of mote count)
    this.moteCoreMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.2, 8, 6),
      new THREE.MeshStandardMaterial({
        color: PALETTE.moteCore,
        roughness: 0.85,
        emissive: PALETTE.moteCore,
        emissiveIntensity: 1.1
      }),
      MAX_MOTES
    );
    this.moteHaloMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.42, 8, 6),
      new THREE.MeshBasicMaterial({ color: PALETTE.moteHalo, transparent: true, opacity: 0.2 }),
      MAX_MOTES
    );
    this.moteCoreMesh.count = 0;
    this.moteHaloMesh.count = 0;
    this.moteCoreMesh.frustumCulled = false;
    this.moteHaloMesh.frustumCulled = false;
    this.scene.add(this.moteCoreMesh, this.moteHaloMesh);

    // Instanced Shades (4 draw calls total even for 200+ Shades in benchmark)
    const shadeBodyGeo = new THREE.SphereGeometry(0.75, 12, 8);
    shadeBodyGeo.scale(1, 1.3, 1);
    const shadeBodyMat = new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.85 });
    this.shadeBodyMesh = new THREE.InstancedMesh(shadeBodyGeo, shadeBodyMat, MAX_SHADES);
    for (let i = 0; i < MAX_SHADES; i++) {
      this.shadeBodyMesh.setColorAt(i, this.colorNormalShade);
    }

    const shadeRimGeo = new THREE.TorusGeometry(0.76, 0.06, 6, 18);
    shadeRimGeo.rotateX(Math.PI / 2);
    this.shadeRimMat = new THREE.MeshBasicMaterial({ color: PALETTE.shadeRim });
    this.shadeRimMesh = new THREE.InstancedMesh(shadeRimGeo, this.shadeRimMat, MAX_SHADES);

    this.shadeEyeMat = new THREE.MeshStandardMaterial({
      color: PALETTE.shadeRim,
      roughness: 0.5,
      emissive: PALETTE.shadeRim,
      emissiveIntensity: 1.1
    });
    const eyeLGeo = new THREE.SphereGeometry(0.1, 6, 6);
    eyeLGeo.translate(-0.22, 0.32, 0.65);
    const eyeRGeo = new THREE.SphereGeometry(0.1, 6, 6);
    eyeRGeo.translate(0.22, 0.32, 0.65);
    this.shadeEyeLMesh = new THREE.InstancedMesh(eyeLGeo, this.shadeEyeMat, MAX_SHADES);
    this.shadeEyeRMesh = new THREE.InstancedMesh(eyeRGeo, this.shadeEyeMat, MAX_SHADES);

    for (const im of [this.shadeBodyMesh, this.shadeRimMesh, this.shadeEyeLMesh, this.shadeEyeRMesh]) {
      im.count = 0;
      im.frustumCulled = false;
      this.scene.add(im);
    }

    // Client-only creativity: rising lantern embers (1 draw call; disabled in bench & reduced-motion)
    this.embersGeo.setAttribute('position', new THREE.BufferAttribute(this.embersPos, 3));
    this.embersPoints = new THREE.Points(
      this.embersGeo,
      new THREE.PointsMaterial({ color: PALETTE.gold, size: 0.24, transparent: true, opacity: 0.75 })
    );
    this.embersPoints.frustumCulled = false;
    this.embersPoints.visible = false;
    this.scene.add(this.embersPoints);

    // Mây
    this.mesh(new THREE.CylinderGeometry(0.36, 0.54, 1.05, 10), PALETTE.mayRobe, this.player, 0, 0.85, 0);
    this.mesh(new THREE.TorusGeometry(0.34, 0.08, 6, 16), PALETTE.mayScarfAndCharm, this.player, 0, 1.32, 0).rotation.x =
      Math.PI / 2;
    this.mesh(new THREE.SphereGeometry(0.27, 10, 8), '#e8c49e', this.player, 0, 1.6, 0);
    this.mesh(new THREE.ConeGeometry(0.84, 0.42, 20), PALETTE.mayRobe, this.player, 0, 1.98, 0);
    this.mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.5, 8), PALETTE.wood, this.player, -0.22, 0.25, 0);
    this.mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.5, 8), PALETTE.wood, this.player, 0.22, 0.25, 0);
    this.mesh(new THREE.SphereGeometry(0.22, 10, 8), PALETTE.lanternLit, this.player, 0.68, 0.92, -0.14, true);
    const lamp = new THREE.PointLight(PALETTE.lanternLit, 4.5, 8);
    lamp.position.set(0.68, 1.0, -0.14);
    this.player.add(lamp);
    this.scene.add(this.player);

    const leafGeo = new THREE.BoxGeometry(0.32, 0.05, 0.18);
    const leafMat = new THREE.MeshBasicMaterial({ color: PALETTE.gold });
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(leafGeo, leafMat);
      m.visible = false;
      this.scene.add(m);
      this.leaves.push(m);
    }

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setColorblind(enabled: boolean): void {
    this.colorblind = enabled;
    const accent = enabled ? PALETTE.shadeRimColorblind : PALETTE.shadeRim;
    this.shadeRimMat.color.set(accent);
    this.shadeEyeMat.color.set(accent);
    this.shadeEyeMat.emissive.set(accent);
  }

  setBenchMode(enabled: boolean): void {
    this.benchMode = enabled;
    if (enabled) {
      this.shakeTime = 0;
      this.shakeAmp = 0;
      this.embersPoints.visible = false;
    }
  }

  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
    if (enabled) {
      this.shakeTime = 0;
      this.shakeAmp = 0;
      this.embersPoints.visible = false;
    }
  }

  getRendererInfo(): string {
    const gl = this.renderer.getContext();
    let gpu = String(gl.getParameter(gl.RENDERER) || 'WebGL');
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      const unmasked = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      if (typeof unmasked === 'string' && unmasked.trim()) {
        gpu = unmasked.trim();
      }
    }
    const ver = gl instanceof WebGL2RenderingContext ? 'WebGL2' : 'WebGL1';
    return `Three.js r${THREE.REVISION} / ${ver} (${gpu})`;
  }

  private mesh(
    geo: THREE.BufferGeometry,
    color: string,
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    glow = false
  ): THREE.Mesh {
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        emissive: glow ? color : '#000000',
        emissiveIntensity: glow ? 1.1 : 0
      })
    );
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  private resize(): void {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  private entity(key: string, create: () => THREE.Group): THREE.Group {
    let g = this.entities.get(key);
    if (!g) {
      g = create();
      this.entities.set(key, g);
      this.scene.add(g);
    }
    return g;
  }

  private dispose(g: THREE.Object3D): void {
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => m.dispose());
      }
    });
    g.parent?.remove(g);
  }

  private buildTerrain(night: NightNumber): void {
    if (this.builtNight === night) return;
    this.builtNight = night;
    while (this.terrainGroup.children.length > 0) {
      this.dispose(this.terrainGroup.children[0]);
    }

    const addIslandDisk = (cx: number, cz: number, radius: number, topY: number, height: number) => {
      this.mesh(
        new THREE.CylinderGeometry(radius, radius * 0.92, height, 48),
        PALETTE.grass,
        this.terrainGroup,
        cx,
        topY - height / 2,
        cz
      );
      const shore = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.25, 6, 64),
        new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.9 })
      );
      shore.rotation.x = Math.PI / 2;
      shore.position.set(cx, topY + 0.02, cz);
      this.terrainGroup.add(shore);
    };

    const addLaunchPad = (pos: Pos3) => {
      this.mesh(
        new THREE.CylinderGeometry(1.0, 1.1, 0.22, 20),
        PALETTE.wood,
        this.terrainGroup,
        pos[0],
        pos[1] + 0.11,
        pos[2]
      );
      this.mesh(
        new THREE.CylinderGeometry(0.72, 0.72, 0.25, 20),
        PALETTE.gold,
        this.terrainGroup,
        pos[0],
        pos[1] + 0.14,
        pos[2],
        true
      );
    };

    if (night === 1) {
      addIslandDisk(0, 0, 40, 0, 5);
    } else if (night === 2) {
      addIslandDisk(0, 0, 28, 0, 5);
      addIslandDisk(70, 0, 28, 0, 5);
      this.mesh(new THREE.BoxGeometry(18, 0.36, 4), PALETTE.wood, this.terrainGroup, 35, -0.18, 0);
      for (let x = 27; x <= 43; x += 2) {
        this.mesh(new THREE.BoxGeometry(0.25, 0.42, 4.1), PALETTE.sand, this.terrainGroup, x, -0.15, 0);
      }
      for (const pad of NIGHT_MAPS[2].launchPads) addLaunchPad(pad.pos);
    } else {
      addIslandDisk(0, 0, 45, 0, 5);

      const shape = new THREE.Shape();
      shape.absarc(0, 0, 24, 0, Math.PI, false);
      shape.absarc(0, 0, 12, Math.PI, 0, true);
      const extrude = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false, curveSegments: 32 });
      const tier1 = new THREE.Mesh(extrude, new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.85 }));
      tier1.rotation.x = Math.PI / 2;
      tier1.position.y = 3;
      this.terrainGroup.add(tier1);

      addIslandDisk(0, 0, 8, 6, 6);
      this.mesh(new THREE.CylinderGeometry(2, 2.2, 8, 16), PALETTE.wood, this.terrainGroup, 0, 10, 0);
      this.mesh(new THREE.ConeGeometry(2.8, 2.2, 8), PALETTE.gold, this.terrainGroup, 0, 15, 0);

      const rampLen = Math.hypot(6, 3);
      const slope = Math.atan2(3, 6);
      for (const deg of [30, 150]) {
        const rad = (deg * Math.PI) / 180;
        const midR = 27;
        const g = new THREE.Group();
        g.position.set(Math.cos(rad) * midR, 1.5, Math.sin(rad) * midR);
        g.rotation.y = -rad + Math.PI / 2;
        const plank = new THREE.Mesh(
          new THREE.BoxGeometry(3, 0.35, rampLen),
          new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.9 })
        );
        plank.rotation.x = slope;
        g.add(plank);
        this.terrainGroup.add(g);
      }

      for (const pad of NIGHT_MAPS[3].launchPads) addLaunchPad(pad.pos);
    }
  }

  reset(): void {
    for (const g of this.entities.values()) this.dispose(g);
    this.entities.clear();
    for (const r of this.rings) this.dispose(r.mesh);
    this.rings = [];
    this.moteCoreMesh.count = 0;
    this.moteHaloMesh.count = 0;
    this.shadeBodyMesh.count = 0;
    this.shadeRimMesh.count = 0;
    this.shadeEyeLMesh.count = 0;
    this.shadeEyeRMesh.count = 0;
    this.embersPoints.visible = false;
    this.shakeTime = 0;
    this.shakeAmp = 0;
  }

  projectToScreen(pos: Pos3): ProjectedPoint {
    const v = new THREE.Vector3(pos[0], pos[1] + 2, pos[2]).project(this.camera);
    const inFront = v.z < 1;
    const onScreen = inFront && Math.abs(v.x) <= 0.95 && Math.abs(v.y) <= 0.95;
    return { x: v.x, y: v.y, inFront, onScreen };
  }

  draw(
    s: Snapshot,
    hud: HudState,
    yaw: number,
    elapsed: number,
    delta: number,
    events: GameEvent[],
    benchCameraElapsedS?: number
  ): void {
    this.buildTerrain(s.night);
    const p = s.player.pos;
    this.player.position.set(p[0], p[1], p[2]);
    this.player.rotation.y = yaw;
    this.player.visible = !hud.respawning && !(s.player.invuln && Math.floor(elapsed * 14) % 2 === 0);

    const active = new Set<string>();
    const blink1Hz = Math.sin(elapsed * Math.PI * 2) >= 0;

    for (const l of s.lanterns) {
      const key = 'lantern:' + l.id;
      active.add(key);
      const g = this.entity(key, () => {
        const group = new THREE.Group();
        this.mesh(new THREE.CylinderGeometry(1.15, 1.55, 0.5, 8), PALETTE.wood, group, 0, 0.25, 0);
        for (const x of [-0.6, 0.6]) this.mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.5, 8), PALETTE.wood, group, x, 1.75, 0);
        this.mesh(new THREE.ConeGeometry(1.5, 0.9, 6), PALETTE.lanternUnlit, group, 0, 3.2, 0);

        const orb = this.mesh(new THREE.SphereGeometry(0.8, 14, 10), PALETTE.lanternUnlit, group, 0, 2.1, 0);
        orb.name = 'orb';

        // Visible tear strips on unlit lanterns (color-independent cue)
        const tears = new THREE.Group();
        tears.name = 'tears';
        for (const [tx, tz, rot] of [
          [0.42, 0.68, 0.45],
          [-0.45, 0.65, -0.5],
          [0, -0.78, 0.35]
        ] as [number, number, number][]) {
          const tear = new THREE.Mesh(
            new THREE.BoxGeometry(0.14, 0.72, 0.08),
            new THREE.MeshBasicMaterial({ color: '#14151c' })
          );
          tear.position.set(tx, 2.05, tz);
          tear.rotation.z = rot;
          tears.add(tear);
        }
        group.add(tears);

        // Overhead fuel bar (visible when lit)
        const fuelBar = new THREE.Group();
        fuelBar.name = 'fuelBar';
        fuelBar.position.set(0, 4.3, 0);
        const bg = new THREE.Mesh(
          new THREE.PlaneGeometry(1.9, 0.26),
          new THREE.MeshBasicMaterial({ color: '#0E1430', side: THREE.DoubleSide })
        );
        fuelBar.add(bg);
        const fill = new THREE.Mesh(
          new THREE.PlaneGeometry(1.76, 0.16),
          new THREE.MeshBasicMaterial({ color: PALETTE.lanternLit, side: THREE.DoubleSide })
        );
        fill.name = 'fuelFill';
        fill.position.z = 0.02;
        fuelBar.add(fill);
        group.add(fuelBar);

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(T.safe_radius - 0.12, T.safe_radius, 48),
          new THREE.MeshBasicMaterial({ color: PALETTE.lanternLit, transparent: true, opacity: 0.34, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.05;
        ring.name = 'safe';
        group.add(ring);

        const point = new THREE.PointLight(PALETTE.lanternLit, 0, 15);
        point.position.y = 2.3;
        point.name = 'light';
        group.add(point);
        return group;
      });
      g.position.set(l.pos[0], l.pos[1], l.pos[2]);

      const orb = g.getObjectByName('orb') as THREE.Mesh;
      const mat = orb.material as THREE.MeshStandardMaterial;
      const tears = g.getObjectByName('tears')!;
      const fuelBar = g.getObjectByName('fuelBar')!;
      const fuelFill = g.getObjectByName('fuelFill') as THREE.Mesh;
      const fillMat = fuelFill.material as THREE.MeshBasicMaterial;
      const lowFuel = l.lit && l.fuel < T.low_fuel_threshold;
      const pulseOn = !lowFuel || blink1Hz;

      orb.scale.set(1, l.lit ? 1 : 0.8, 1);
      tears.visible = !l.lit;

      mat.color.set(l.lit ? PALETTE.lanternCore : PALETTE.lanternUnlit);
      mat.emissive.set(l.lit ? PALETTE.lanternLit : '#000000');
      mat.emissiveIntensity = l.lit ? (pulseOn ? 1.8 : 0.35) : 0;

      fuelBar.visible = l.lit && pulseOn;
      if (l.lit) {
        const ratio = Math.max(0.02, Math.min(1, l.fuel / T.fuel_max));
        fuelFill.scale.x = ratio;
        fuelFill.position.x = -0.88 * (1 - ratio);
        fillMat.color.set(lowFuel ? (this.colorblind ? '#FFFFFF' : PALETTE.danger) : PALETTE.lanternLit);
        fuelBar.lookAt(this.camera.position);
      }

      g.getObjectByName('safe')!.visible = l.lit && l.fuel >= T.low_fuel_threshold;
      (g.getObjectByName('light') as THREE.PointLight).intensity = l.lit ? (pulseOn ? 14 : 4) : 0;
    }

    // Update InstancedMesh Motes
    const moteCount = Math.min(s.motes.length, MAX_MOTES);
    this.moteCoreMesh.count = moteCount;
    this.moteHaloMesh.count = moteCount;
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.set(1, 1, 1);
    for (let i = 0; i < moteCount; i++) {
      const m = s.motes[i];
      this.dummy.position.set(m.pos[0], m.pos[1] + 0.9 + Math.sin(elapsed * 2.4 + m.pos[0]) * 0.2, m.pos[2]);
      this.dummy.updateMatrix();
      this.moteCoreMesh.setMatrixAt(i, this.dummy.matrix);
      this.moteHaloMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.moteCoreMesh.instanceMatrix.needsUpdate = true;
    this.moteHaloMesh.instanceMatrix.needsUpdate = true;

    // Update InstancedMesh Shades
    const shadeCount = Math.min(s.shades.length, MAX_SHADES);
    this.shadeBodyMesh.count = shadeCount;
    this.shadeRimMesh.count = shadeCount;
    this.shadeEyeLMesh.count = shadeCount;
    this.shadeEyeRMesh.count = shadeCount;
    for (let i = 0; i < shadeCount; i++) {
      const sh = s.shades[i];
      const bobY = sh.pos[1] + Math.sin(elapsed * 2.2) * 0.1;
      this.dummy.position.set(sh.pos[0], bobY, sh.pos[2]);
      this.dummy.lookAt(p[0], bobY, p[2]);
      if (sh.state === 'stunned') {
        this.dummy.rotateZ(0.25 * Math.sin(elapsed * 20));
      }
      const scale =
        sh.state === 'spawning'
          ? 0.6 + 0.4 * Math.sin(elapsed * 12)
          : sh.state === 'drain'
            ? 1 + 0.15 * Math.sin(elapsed * 10)
            : 1;
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.shadeBodyMesh.setMatrixAt(i, this.dummy.matrix);
      this.shadeRimMesh.setMatrixAt(i, this.dummy.matrix);
      this.shadeEyeLMesh.setMatrixAt(i, this.dummy.matrix);
      this.shadeEyeRMesh.setMatrixAt(i, this.dummy.matrix);
      this.shadeBodyMesh.setColorAt(i, sh.state === 'stunned' ? this.colorStunnedShade : this.colorNormalShade);
    }
    this.shadeBodyMesh.instanceMatrix.needsUpdate = true;
    this.shadeRimMesh.instanceMatrix.needsUpdate = true;
    this.shadeEyeLMesh.instanceMatrix.needsUpdate = true;
    this.shadeEyeRMesh.instanceMatrix.needsUpdate = true;
    if (this.shadeBodyMesh.instanceColor) {
      this.shadeBodyMesh.instanceColor.needsUpdate = true;
    }

    for (const d of s.drifters) {
      const key = 'drifter:' + d.id;
      active.add(key);
      const g = this.entity(key, () => {
        const group = new THREE.Group();
        const silk = this.mesh(new THREE.BoxGeometry(0.45, 0.14, 1.5), PALETTE.drifter, group, 0, 0, 0, true);
        silk.name = 'silk';
        const loot = this.mesh(new THREE.SphereGeometry(0.24, 8, 6), PALETTE.gold, group, 0, 0.35, 0, true);
        loot.name = 'loot';
        return group;
      });
      g.position.set(d.pos[0], d.pos[1] + 0.5 + Math.sin(elapsed * 3.5) * 0.18, d.pos[2]);
      g.rotation.y = elapsed * 2;
      g.getObjectByName('loot')!.visible = d.stolen > 0;
    }

    for (const c of s.charms) {
      if (!c.available) continue;
      const key = 'charm:' + c.id;
      active.add(key);
      const g = this.entity(key, () => {
        const group = new THREE.Group();
        this.mesh(new THREE.BoxGeometry(0.55, 0.9, 0.12), PALETTE.mayScarfAndCharm, group, 0, 0, 0, true);
        this.mesh(new THREE.BoxGeometry(0.65, 1.0, 0.08), PALETTE.gold, group, 0, 0, 0, true);
        return group;
      });
      g.position.set(c.pos[0], c.pos[1] + 1.0 + Math.sin(elapsed * 2.8) * 0.15, c.pos[2]);
      g.rotation.y = elapsed * 1.6;
    }

    for (const [key, g] of this.entities) {
      if (!active.has(key)) {
        this.dispose(g);
        this.entities.delete(key);
      }
    }

    for (const e of events) {
      if (e.name === 'pulse') {
        const mesh = new THREE.Mesh(
          new THREE.RingGeometry(0.85, 1, 48),
          new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(p[0], p[1] + 0.2, p[2]);
        this.scene.add(mesh);
        this.rings.push({ mesh, age: 0 });
        if (!this.benchMode && !this.reducedMotion) {
          this.shakeTime = Math.max(this.shakeTime, 0.16);
          this.shakeAmp = Math.max(this.shakeAmp, 0.18);
        }
      } else if (e.name === 'player_hit' && !this.benchMode && !this.reducedMotion) {
        this.shakeTime = 0.32;
        this.shakeAmp = 0.45;
      }
    }

    this.rings = this.rings.filter((r) => {
      r.age += delta;
      r.mesh.scale.setScalar(1 + r.age * 10);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - r.age / 0.45);
      if (r.age > 0.45) {
        this.dispose(r.mesh);
        return false;
      }
      return true;
    });

    const showLeaves = hud.wind_warning || hud.wind_active;
    const windRad = (hud.wind_dir_deg * Math.PI) / 180;
    this.leaves.forEach((leaf, idx) => {
      leaf.visible = showLeaves;
      if (showLeaves) {
        const phase = (elapsed * (hud.wind_active ? 18 : 8) + idx * 3.7) % 24;
        const spread = (idx - 9) * 2.1;
        leaf.position.set(
          p[0] + Math.cos(windRad) * (phase - 12) - Math.sin(windRad) * spread,
          p[1] + 1.2 + (idx % 4) * 0.7,
          p[2] + Math.sin(windRad) * (phase - 12) + Math.cos(windRad) * spread
        );
        leaf.rotation.set(elapsed * 4 + idx, elapsed * 3, idx);
      }
    });

    const litLanterns = s.lanterns.filter((l) => l.lit);
    const litRatio = litLanterns.length / s.lanterns.length;
    this.ambient.intensity = 0.15 + 0.55 * litRatio;
    this.sky.set(PALETTE.sky).lerp(this.fogBase, litRatio * 0.55);

    // Client-only creativity: dawn sky warmth & lantern embers (strictly disabled in benchMode & reducedMotion)
    if (!this.benchMode && !this.reducedMotion) {
      const dawnBlend = s.state === 'won' ? 0.65 : s.time_left_s <= 30 ? Math.max(0, (30 - s.time_left_s) / 30) * 0.45 : 0;
      if (dawnBlend > 0) {
        this.sky.lerp(this.dawnColor, dawnBlend);
        this.moon.color.copy(this.moonColorBase).lerp(this.moonColorDawn, dawnBlend);
      } else {
        this.moon.color.copy(this.moonColorBase);
      }

      if (litLanterns.length > 0) {
        this.embersPoints.visible = true;
        for (let i = 0; i < EMBER_COUNT; i++) {
          const anchor = litLanterns[i % litLanterns.length];
          const phase = (elapsed * 0.7 + i * 0.37) % 3.2;
          const angle = i * 1.9 + elapsed * 0.9;
          const rad = 0.4 + (i % 5) * 0.22;
          this.embersPos[i * 3] = anchor.pos[0] + Math.cos(angle) * rad;
          this.embersPos[i * 3 + 1] = anchor.pos[1] + 1.2 + phase * 1.6;
          this.embersPos[i * 3 + 2] = anchor.pos[2] + Math.sin(angle) * rad;
        }
        (this.embersGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      } else {
        this.embersPoints.visible = false;
      }
    } else {
      this.moon.color.copy(this.moonColorBase);
      this.embersPoints.visible = false;
    }

    (this.scene.fog as THREE.FogExp2).color.copy(this.sky);

    if (benchCameraElapsedS !== undefined) {
      const theta = (2 * Math.PI * benchCameraElapsedS) / 15;
      this.camera.position.set(30 * Math.cos(theta), 15, -30 * Math.sin(theta));
      this.camera.lookAt(0, 0, 0);
    } else {
      let sx = 0;
      let sy = 0;
      if (!this.benchMode && !this.reducedMotion && this.shakeTime > 0) {
        this.shakeTime = Math.max(0, this.shakeTime - delta);
        const mag = this.shakeAmp * (this.shakeTime / 0.32);
        sx = Math.sin(elapsed * 57) * mag;
        sy = Math.cos(elapsed * 73) * mag * 0.6;
      }
      this.camera.position.set(p[0] + Math.sin(yaw) * 22 + sx, p[1] + 24 + sy, p[2] + Math.cos(yaw) * 22);
      this.camera.lookAt(p[0], p[1] + 0.8, p[2]);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
