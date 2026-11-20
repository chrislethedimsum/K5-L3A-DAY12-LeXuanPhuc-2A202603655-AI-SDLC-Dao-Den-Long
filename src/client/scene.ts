import * as THREE from 'three';
import contract from '../core/contract';
import type { GameEvent, HudState, Snapshot } from '../core/types';

const T = contract.tuning;

export class IslandScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(48, 1, 0.1, 260);
  private player = new THREE.Group();
  private entities = new Map<string, THREE.Group>();
  private rings: { mesh: THREE.Mesh; age: number }[] = [];
  private sky = new THREE.Color('#152b46');
  private light = new THREE.HemisphereLight(0xc3e3ff, 0x283736, 2.5);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.scene.background = this.sky;
    this.scene.fog = new THREE.FogExp2('#152b46', 0.008);
    this.scene.add(this.light);

    const moon = new THREE.DirectionalLight(0xcbe7ff, 2.5);
    moon.position.set(-20, 40, -15);
    this.scene.add(moon);

    this.mesh(new THREE.CylinderGeometry(35, 30, 5, 72), '#426e69', this.scene, 0, -2.6, 0);
    this.mesh(new THREE.ConeGeometry(30, 15, 9), '#344b56', this.scene, 0, -12, 0).rotation.z = Math.PI;
    this.mesh(new THREE.CylinderGeometry(35.2, 35.2, 0.18, 72), '#8ba899', this.scene, 0, -0.05, 0);

    const shore = new THREE.Mesh(
      new THREE.TorusGeometry(35, 0.16, 6, 100),
      new THREE.MeshStandardMaterial({ color: '#d8cba4' })
    );
    shore.rotation.x = Math.PI / 2;
    this.scene.add(shore);

    for (let i = 0; i < 32; i++) {
      const a = i * 2.39996;
      const r = 40 + (i % 7) * 5;
      const cloud = this.mesh(
        new THREE.IcosahedronGeometry(5 + (i % 4), 1),
        '#7499af',
        this.scene,
        Math.cos(a) * r,
        -6 - (i % 3) * 2,
        Math.sin(a) * r
      );
      cloud.scale.set(1.8, 0.3, 1);
    }

    const stars: number[] = [];
    for (let i = 0; i < 240; i++) {
      const a = i * 2.39996;
      const y = 20 + (i % 51);
      stars.push(Math.cos(a) * 95, y, Math.sin(a) * 95);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
    this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xf4edcf, size: 0.22 })));

    // Mây: indigo tunic, paper nón lá and a small carried lantern.
    this.mesh(new THREE.CylinderGeometry(0.38, 0.55, 1.1, 10), '#b3d8ce', this.player, 0, 0.85, 0);
    this.mesh(new THREE.SphereGeometry(0.28, 12, 8), '#e5bc94', this.player, 0, 1.6, 0);
    this.mesh(new THREE.ConeGeometry(0.85, 0.42, 24), '#f4edcf', this.player, 0, 1.99, 0);
    this.mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8), '#344b56', this.player, -0.23, 0.25, 0);
    this.mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 8), '#344b56', this.player, 0.23, 0.25, 0);
    this.mesh(new THREE.SphereGeometry(0.24, 10, 8), '#ffce79', this.player, 0.7, 0.9, -0.15, true);
    const lamp = new THREE.PointLight(0xffce79, 5, 8);
    lamp.position.set(0.7, 1, -0.15);
    this.player.add(lamp);
    this.scene.add(this.player);

    this.resize();
    window.addEventListener('resize', () => this.resize());
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
        emissiveIntensity: glow ? 1 : 0
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
    this.scene.remove(g);
  }

  reset(): void {
    for (const g of this.entities.values()) this.dispose(g);
    this.entities.clear();
    for (const r of this.rings) this.dispose(r.mesh);
    this.rings = [];
  }

  draw(s: Snapshot, hud: HudState, yaw: number, elapsed: number, delta: number, events: GameEvent[]): void {
    const p = s.player.pos;
    this.player.position.set(p[0], p[1], p[2]);
    this.player.rotation.y = yaw;
    this.player.visible = !(hud.invuln_left_s > 0 && Math.floor(elapsed * 12) % 2 === 0);

    const active = new Set<string>();
    for (const l of s.lanterns) {
      const key = 'lantern:' + l.id;
      active.add(key);
      const g = this.entity(key, () => {
        const group = new THREE.Group();
        this.mesh(new THREE.CylinderGeometry(1.25, 1.7, 0.5, 8), '#536b68', group, 0, 0.25, 0);
        for (const x of [-0.65, 0.65]) this.mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 8), '#4b4249', group, x, 1.8, 0);
        this.mesh(new THREE.ConeGeometry(1.6, 0.9, 6), '#525867', group, 0, 3.3, 0);
        const orb = this.mesh(new THREE.SphereGeometry(0.85, 16, 12), '#8c8974', group, 0, 2.15, 0);
        orb.name = 'orb';
        orb.scale.y = 1.1;
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(T.safe_radius - 0.1, T.safe_radius, 64),
          new THREE.MeshBasicMaterial({ color: 0xffce79, transparent: true, opacity: 0.32, side: THREE.DoubleSide })
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.04;
        ring.name = 'safe';
        group.add(ring);
        const point = new THREE.PointLight(0xffce79, 0, 14);
        point.position.y = 2.3;
        point.name = 'light';
        group.add(point);
        return group;
      });
      g.position.set(l.pos[0], 0, l.pos[2]);
      const orb = g.getObjectByName('orb') as THREE.Mesh;
      const mat = orb.material as THREE.MeshStandardMaterial;
      mat.color.set(l.lit ? '#ffce79' : '#8c8974');
      mat.emissive.set(l.lit ? '#ffb84d' : '#000000');
      mat.emissiveIntensity = l.lit ? 2 : 0;
      g.getObjectByName('safe')!.visible = l.lit;
      (g.getObjectByName('light') as THREE.PointLight).intensity = l.lit ? 15 : 0;
    }

    for (const m of s.motes) {
      const key = 'mote:' + m.id;
      active.add(key);
      const g = this.entity(key, () => {
        const group = new THREE.Group();
        this.mesh(new THREE.SphereGeometry(0.19, 8, 6), '#e9f29b', group, 0, 0, 0, true);
        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(0.38, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xe9f29b, transparent: true, opacity: 0.12 })
        );
        group.add(halo);
        return group;
      });
      g.position.set(m.pos[0], 1 + Math.sin(elapsed * 2 + m.pos[0]) * 0.22, m.pos[2]);
    }

    for (const sh of s.shades) {
      const key = 'shade:' + sh.id;
      active.add(key);
      const g = this.entity(key, () => {
        const group = new THREE.Group();
        const body = this.mesh(new THREE.SphereGeometry(0.8, 12, 8), '#382b58', group, 0, 0.9, 0);
        body.scale.y = 1.35;
        for (const x of [-0.25, 0.25]) this.mesh(new THREE.SphereGeometry(0.1, 6, 6), '#c8a8e8', group, x, 1.3, 0.7, true);
        return group;
      });
      g.position.set(sh.pos[0], Math.sin(elapsed * 2) * 0.12, sh.pos[2]);
      g.lookAt(p[0], 0, p[2]);
      g.rotation.z = sh.state === 'stunned' ? 0.25 * Math.sin(elapsed * 18) : 0;
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
          new THREE.RingGeometry(0.9, 1, 64),
          new THREE.MeshBasicMaterial({ color: 0xffdf94, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(p[0], 0.15, p[2]);
        this.scene.add(mesh);
        this.rings.push({ mesh, age: 0 });
      }
    }

    this.rings = this.rings.filter((r) => {
      r.age += delta;
      const radius = 1 + r.age * 12;
      r.mesh.scale.setScalar(radius);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - r.age / 0.5);
      if (r.age > 0.5) {
        this.dispose(r.mesh);
        return false;
      }
      return true;
    });

    const litRatio = s.lanterns.filter((l) => l.lit).length / s.lanterns.length;
    this.sky.set('#152b46').lerp(new THREE.Color('#638997'), litRatio * 0.65);
    (this.scene.fog as THREE.FogExp2).color.copy(this.sky);
    this.camera.position.set(p[0] + Math.sin(yaw) * 22, p[1] + 25, p[2] + Math.cos(yaw) * 22);
    this.camera.lookAt(p[0], 0, p[2]);
    this.renderer.render(this.scene, this.camera);
  }
}
