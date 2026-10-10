/** The 3D world: ground, buildings, lamps, sky, and the people walking in it. */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { faceFor, HAIR_COLORS, SKIN_TONES } from "../faces";
import { years } from "../stats";
import type { Town } from "../types";
import { daylight, sunAngle } from "./clock";
import { hash01, pushOut, type Building, type Layout } from "./layout";
import type { Sample } from "./replay";

const ACTION_COLORS = ["#d0873f", "#7a6ac4", "#d05a8c", "#3f7cd0", "#4fa070"];
const JAILED_COLOR = "#d9822b";
const HAIR_HEIGHT = [0.7, 1.3, 0.5, 1, 0];
const KIND_WALL: Record<string, string> = { Shack: "#a98c6a", House: "#e0cfae", Villa: "#f0e6d0", Flat: "#b9bcc4" };
const ADULT_YEARS = 16;
const SKY_NIGHT = new THREE.Color("#060a18");
const SKY_DAY = new THREE.Color("#8ec5ff");
const SKY_DUSK = new THREE.Color("#f2a05a");

export interface Pose {
  x: number;
  z: number;
  heading: number;
  height: number;
}

type Instanced = THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>;

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number): Instanced {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
  mesh.count = count;
  return mesh;
}

function place(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rotY = 0): void {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
    new THREE.Vector3(sx, sy, sz),
  );
  mesh.setMatrixAt(i, m);
}

function paint(mesh: THREE.InstancedMesh, i: number, color: string | THREE.Color): void {
  mesh.setColorAt(i, new THREE.Color(color));
}

export class WorldScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  onSelect: (id: number | null) => void = () => {};
  onBuilding: (building: Building | null) => void = () => {};

  private readonly scene = new THREE.Scene();
  private readonly sun = new THREE.DirectionalLight("#ffffff", 2);
  private readonly moon = new THREE.DirectionalLight("#7f9bff", 0.3);
  private readonly sky = new THREE.HemisphereLight("#bfdcff", "#4a5a3a", 0.8);
  private readonly center: THREE.Vector3;
  private readonly windows: Instanced;
  private readonly windowThreshold: number[] = [];
  private readonly bulbs: Instanced;
  private readonly glow: THREE.MeshBasicMaterial;
  private readonly stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly bodies: Instanced;
  private readonly heads: Instanced;
  private readonly hair: Instanced;
  private readonly badges: Instanced;
  private readonly outfits: THREE.Color[] = [];
  private readonly statures: number[] = [];
  private readonly hairStyles: number[] = [];
  private buildingMesh!: Instanced;
  private readonly buildingList: Building[] = [];
  private readonly outline: THREE.LineSegments;
  private readonly workLabels = new THREE.Group();
  private readonly districtLabels = new THREE.Group();
  private selectedBuilding: Building | null = null;
  private readonly ring: THREE.Mesh;
  private readonly index = new Map<number, number>();
  private readonly ids: number[] = [];
  private readonly lastAction: number[];
  private readonly poses: Pose[];
  private readonly birthTicks: number[];
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private lastNight = -1;
  private selected: number | null = null;
  private time = 0;

  constructor(
    host: HTMLElement,
    private readonly layout: Layout,
    town: Town,
  ) {
    this.center = new THREE.Vector3(layout.width / 2, 0, layout.depth / 2);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
    this.camera.position.set(this.center.x + 48, 46, this.center.z + 58);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(this.center);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.05;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 170;

    this.scene.background = new THREE.Color(SKY_DAY);
    this.scene.fog = new THREE.Fog(SKY_DAY, 70, 260);
    this.scene.add(this.sky, this.sun, this.moon, this.sun.target, this.moon.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -48;
    cam.right = 48;
    cam.top = 48;
    cam.bottom = -48;
    cam.far = 220;
    this.sun.shadow.bias = -0.0005;

    this.buildGround();
    this.buildBuildings();
    this.buildTrees();
    ({ bulbs: this.bulbs, glow: this.glow } = this.buildLamps());
    this.windows = this.buildWindows();
    this.stars = this.buildStars();
    this.buildLabels();

    const people = town.people;
    people.forEach((p, i) => {
      this.index.set(p.id, i);
      this.ids.push(p.id);
    });
    this.birthTicks = people.map((p) => town.tick - p.age);
    this.lastAction = people.map(() => -1);
    this.poses = people.map(() => ({ x: 0, z: 0, heading: 0, height: 1.7 }));
    const body = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    const head = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    const hairMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    this.bodies = instanced(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8), body, people.length);
    this.heads = instanced(new THREE.SphereGeometry(0.14, 14, 10), head, people.length);
    this.hair = instanced(new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hairMaterial, people.length);
    this.badges = instanced(new THREE.OctahedronGeometry(0.07), new THREE.MeshBasicMaterial({ toneMapped: false }), people.length);
    const byId = new Map(people.map((p) => [p.id, p]));
    const cache = new Map();
    people.forEach((p, i) => {
      const f = faceFor(p.id, byId, cache);
      const t = f.skin * (SKIN_TONES.length - 1);
      const a = new THREE.Color(SKIN_TONES[Math.floor(t)] ?? "#cf9a6b");
      const b = new THREE.Color(SKIN_TONES[Math.min(SKIN_TONES.length - 1, Math.floor(t) + 1)] ?? "#cf9a6b");
      this.heads.setColorAt(i, a.lerp(b, t - Math.floor(t)));
      this.hair.setColorAt(i, new THREE.Color(HAIR_COLORS[f.hair] ?? "#3b2417"));
      this.hairStyles.push(f.hairStyle);
      const outfit = new THREE.Color().setHSL(hash01(p.id, 50), 0.3 + hash01(p.id, 51) * 0.45, 0.3 + hash01(p.id, 52) * 0.25);
      this.outfits.push(outfit);
      this.bodies.setColorAt(i, outfit);
      this.statures.push(0.93 + hash01(p.id, 60) * 0.14);
      for (const m of [this.bodies, this.heads, this.hair, this.badges]) m.setMatrixAt(i, this.hidden);
    });
    for (const m of [this.bodies, this.heads, this.hair]) {
      m.castShadow = true;
      m.frustumCulled = false;
      this.scene.add(m);
    }
    this.badges.frustumCulled = false;
    this.scene.add(this.badges);
    this.outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: "#ffd98a", toneMapped: false }));
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.45, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, toneMapped: false }),
    );
    this.ring.visible = false;
    this.scene.add(this.ring);

    this.watchClicks();
    new ResizeObserver(() => this.resize(host)).observe(host);
    this.resize(host);
  }

  private resize(host: HTMLElement): void {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private buildGround(): void {
    const { width, depth, slot } = this.layout;
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 400, depth + 400).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: "#5d8a4a", roughness: 1 }),
    );
    grass.position.set(this.center.x, -0.02, this.center.z);
    grass.receiveShadow = true;
    this.scene.add(grass);
    for (const d of this.layout.districts) {
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(d.size, d.size).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(d.hue, 0.22, 0.2), roughness: 0.95 }),
      );
      road.position.set(d.x + d.size / 2, 0, d.z + d.size / 2);
      road.receiveShadow = true;
      this.scene.add(road);
    }

    const lots = instanced(
      new THREE.PlaneGeometry(slot - 0.5, slot - 0.5).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ roughness: 1 }),
      this.layout.lots.length,
    );
    const colors = { house: "#b4bfa3", work: "#a3a29c", park: "#6aab58" };
    this.layout.lots.forEach((lot, i) => {
      place(lots, i, lot.x, 0.02, lot.z);
      const district = this.layout.districts.find((d) => lot.x >= d.x && lot.x < d.x + d.size && lot.z >= d.z && lot.z < d.z + d.size);
      const tinted = new THREE.Color(colors[lot.use]);
      if (district) tinted.lerp(new THREE.Color().setHSL(district.hue, 0.45, 0.55), lot.use === "park" ? 0.1 : 0.3);
      paint(lots, i, tinted);
    });
    lots.receiveShadow = true;
    this.scene.add(lots);
  }

  private buildBuildings(): void {
    const { houses, workplaces } = this.layout;
    const bodies = instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85 }), houses.length + workplaces.length);
    const roofGeometry = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4);
    const roofs = instanced(roofGeometry, new THREE.MeshStandardMaterial({ roughness: 0.8 }), houses.length + workplaces.length);
    this.buildingMesh = bodies;
    let n = 0;
    houses.forEach((h, i) => {
      this.buildingList.push({ type: "house", ...h });
      place(bodies, n, h.x, h.h / 2, h.z, h.w, h.h, h.d);
      const wall = new THREE.Color(KIND_WALL[h.kind] ?? "#e0cfae");
      wall.offsetHSL((hash01(i, 77) - 0.5) * 0.04, 0, (hash01(i, 78) - 0.5) * 0.08);
      paint(bodies, n, wall);
      const roofH = h.kind === "Flat" ? 0.14 : 0.8;
      place(roofs, n, h.x, h.h + roofH / 2, h.z, h.w * 1.12, roofH, h.d * 1.12);
      paint(roofs, n, h.kind === "Flat" ? "#555a63" : new THREE.Color().setHSL(0.03 + hash01(i, 5) * 0.06, 0.45, 0.32));
      n++;
    });
    workplaces.forEach((w) => {
      this.buildingList.push({ type: "work", ...w });
      place(bodies, n, w.x, w.h / 2, w.z, w.w, w.h, w.d);
      paint(bodies, n, w.color);
      place(roofs, n, w.x, w.h + 0.09, w.z, w.w * 1.06, 0.18, w.d * 1.06);
      paint(roofs, n, "#3a3d44");
      n++;
    });
    for (const m of [bodies, roofs]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    }
  }

  private buildWindows(): Instanced {
    const spots: { x: number; y: number; z: number; rot: number; thr: number }[] = [];
    this.layout.houses.forEach((h, hi) => {
      const lived = h.occupants.length > 0;
      const base = lived ? hash01(hi, 400) * 0.55 : 2;
      for (let f = 0; f < h.floors; f++) {
        const y = 0.45 + f * 1.05;
        if (y > h.h - 0.2) continue;
        for (const dx of [-0.25, 0.25]) {
          spots.push({ x: h.x + dx * h.w, y, z: h.z + h.d / 2 + 0.01, rot: 0, thr: lived ? Math.min(0.95, base + hash01(hi * 9 + f, 11 + dx * 10) * 0.4) : 2 });
          spots.push({ x: h.x + h.w / 2 + 0.01, y, z: h.z + dx * h.d, rot: Math.PI / 2, thr: lived ? Math.min(0.95, base + hash01(hi * 9 + f, 21 + dx * 10) * 0.4) : 2 });
        }
      }
    });
    const mesh = instanced(new THREE.PlaneGeometry(0.34, 0.4), new THREE.MeshBasicMaterial({ toneMapped: false }), spots.length);
    spots.forEach((s, i) => {
      place(mesh, i, s.x, s.y, s.z, 1, 1, 1, s.rot);
      this.windowThreshold.push(s.thr);
      paint(mesh, i, "#2b3b4d");
    });
    this.scene.add(mesh);
    return mesh;
  }

  private buildTrees(): void {
    const { trees } = this.layout;
    const trunks = instanced(new THREE.CylinderGeometry(0.07, 0.1, 0.6, 6), new THREE.MeshStandardMaterial({ color: "#5a3d27" }), trees.length);
    const crowns = instanced(new THREE.ConeGeometry(0.5, 1.4, 8), new THREE.MeshStandardMaterial({ roughness: 0.9 }), trees.length);
    trees.forEach((t, i) => {
      place(trunks, i, t.x, 0.3 * t.s, t.z, t.s, t.s, t.s);
      place(crowns, i, t.x, (0.6 + 0.7) * t.s, t.z, t.s, t.s, t.s);
      paint(crowns, i, new THREE.Color().setHSL(0.3 + hash01(i, 2) * 0.06, 0.5, 0.28 + hash01(i, 3) * 0.1));
    });
    for (const m of [trunks, crowns]) {
      m.castShadow = true;
      this.scene.add(m);
    }
  }

  private buildLamps(): { bulbs: Instanced; glow: THREE.MeshBasicMaterial } {
    const { lamps } = this.layout;
    const poles = instanced(new THREE.CylinderGeometry(0.04, 0.05, 2.4, 6), new THREE.MeshStandardMaterial({ color: "#2c2f36" }), lamps.length);
    const bulbs = instanced(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), lamps.length);
    const glow = new THREE.MeshBasicMaterial({ color: "#ffcf80", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const pools = instanced(new THREE.CircleGeometry(2.6, 24).rotateX(-Math.PI / 2), glow, lamps.length);
    lamps.forEach((l, i) => {
      place(poles, i, l.x, 1.2, l.z);
      place(bulbs, i, l.x, 2.45, l.z);
      paint(bulbs, i, "#555555");
      place(pools, i, l.x, 0.04, l.z);
    });
    this.scene.add(poles, bulbs, pools);
    return { bulbs, glow };
  }

  private buildStars(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
    const count = 700;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const theta = hash01(i, 1) * Math.PI * 2;
      const phi = Math.acos(0.05 + hash01(i, 2) * 0.95);
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * 420;
      positions[i * 3 + 1] = Math.cos(phi) * 420;
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * 420;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: "#ffffff", size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
    stars.frustumCulled = false;
    this.scene.add(stars);
    return stars;
  }

  private watchClicks(): void {
    const el = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    el.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY };
    });
    el.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const people = [...ray.intersectObject(this.bodies), ...ray.intersectObject(this.heads)].sort((a, b) => a.distance - b.distance)[0];
      const building = ray.intersectObject(this.buildingMesh)[0];
      if (people && (!building || people.distance <= building.distance)) {
        const i = people.instanceId;
        this.select(i === undefined ? null : (this.ids[i] ?? null));
      } else if (building?.instanceId !== undefined) {
        this.selectBuilding(this.buildingList[building.instanceId] ?? null);
      } else {
        this.select(null);
      }
    });
  }

  /** Make a text sign. Returns null where there is no canvas to draw on. */
  private sign(text: string, width: number, color: string): THREE.Sprite | null {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "rgba(10,12,22,0.78)";
    ctx.beginPath();
    ctx.roundRect(6, 16, 500, 96, 28);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = "600 52px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 66);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false, fog: false }));
    sprite.scale.set(width, width / 4, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  private buildLabels(): void {
    for (const w of this.layout.workplaces) {
      const sign = this.sign(w.title, 5, "#ffe9b0");
      if (!sign) continue;
      sign.position.set(w.x, w.h + 1.6, w.z);
      this.workLabels.add(sign);
    }
    for (const d of this.layout.districts) {
      const sign = this.sign(d.name, 11, "#ffffff");
      if (!sign) continue;
      sign.position.set(d.x + d.size / 2, 7, d.z + d.size / 2);
      this.districtLabels.add(sign);
    }
    this.scene.add(this.workLabels, this.districtLabels);
  }

  selectBuilding(building: Building | null): void {
    this.selectedBuilding = building;
    this.selected = null;
    this.ring.visible = false;
    this.outline.visible = building !== null;
    if (building) {
      this.outline.scale.set(building.w * 1.1, building.h * 1.1, building.d * 1.1);
      this.outline.position.set(building.x, building.h / 2, building.z);
    }
    this.onSelect(null);
    this.onBuilding(building);
  }

  /** Open the building for a home id, if the town has one. */
  selectHome(homeId: number): void {
    const found = this.buildingList.find((b) => b.type === "house" && b.id === homeId);
    if (found) this.selectBuilding(found);
  }

  get selectedBuildingNow(): Building | null {
    return this.selectedBuilding;
  }

  select(id: number | null): void {
    this.selected = id;
    this.ring.visible = id !== null;
    if (id !== null || this.selectedBuilding) {
      this.selectedBuilding = null;
      this.outline.visible = false;
      this.onBuilding(null);
    }
    this.onSelect(id);
  }

  get selectedId(): number | null {
    return this.selected;
  }

  /** Where a person stands right now, for the camera and later for seeing through their eyes. */
  poseOf(id: number): Pose | null {
    const i = this.index.get(id);
    const pose = i === undefined ? null : this.poses[i];
    return pose && this.lastAction[i as number] !== -1 ? pose : null;
  }

  private applyLight(tick: number): void {
    const day = daylight(tick);
    const night = 1 - day;
    const dusk = 1 - Math.abs(day - 0.5) * 2;
    const sky = SKY_NIGHT.clone().lerp(SKY_DAY, day).lerp(SKY_DUSK, dusk * 0.55);
    (this.scene.background as THREE.Color).copy(sky);
    (this.scene.fog as THREE.Fog).color.copy(sky);
    const a = sunAngle(tick);
    const elevation = Math.max(0.12, Math.sin(a));
    this.sun.position.set(this.center.x + Math.cos(a) * 90, elevation * 90, this.center.z + 35);
    this.sun.target.position.copy(this.center);
    this.sun.intensity = 2.6 * day;
    this.sun.color.set("#ffffff").lerp(new THREE.Color("#ff9a55"), dusk * 0.7);
    this.moon.position.set(this.center.x - 40, 80, this.center.z - 30);
    this.moon.target.position.copy(this.center);
    this.moon.intensity = 0.55 * night;
    this.sky.intensity = 0.12 + 0.85 * day;
    this.stars.material.opacity = Math.max(0, night * 1.2 - 0.2);
    this.glow.opacity = 0.32 * night;
    const q = Math.round(night * 50) / 50;
    if (q !== this.lastNight) {
      this.lastNight = q;
      this.paintNight(q);
    }
  }

  private paintNight(night: number): void {
    const lit = new THREE.Color("#ffd98a");
    const dark = new THREE.Color("#2b3b4d");
    this.windowThreshold.forEach((thr, i) => {
      this.windows.setColorAt(i, night > thr * 0.9 + 0.05 ? lit : dark);
    });
    if (this.windows.instanceColor) this.windows.instanceColor.needsUpdate = true;
    const bulbOn = new THREE.Color("#ffe9b0");
    const bulbOff = new THREE.Color("#555555");
    for (let i = 0; i < this.bulbs.count; i++) this.bulbs.setColorAt(i, night > 0.25 ? bulbOn : bulbOff);
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
  }

  /** Draw the world at a game tick. */
  update(tick: number, samples: Sample[], seconds: number): void {
    this.time += seconds;
    this.applyLight(tick);
    const visible = new Set<number>();
    const tmp = new THREE.Matrix4();
    for (const s of samples) {
      const i = this.index.get(s.id);
      if (i === undefined) continue;
      visible.add(i);
      const spot = pushOut(this.layout, s.x + 0.5, s.y + 0.5);
      const pose = this.poses[i] as Pose;
      const dx = spot.x - pose.x;
      const dz = spot.z - pose.z;
      const moved = Math.hypot(dx, dz);
      if (this.lastAction[i] !== -1 && moved > 0.01 && moved < 6) pose.heading = Math.atan2(dx, dz);
      pose.x = spot.x;
      pose.z = spot.z;
      const adult = years(Math.max(0, tick - (this.birthTicks[i] ?? 0))) >= ADULT_YEARS;
      const scale = (adult ? 1 : 0.7) * (this.statures[i] ?? 1);
      pose.height = 1.7 * scale * 0.5;
      const bob = Math.abs(Math.sin(this.time * 7 + i)) * (s.action === 1 ? 0 : 0.03);
      tmp.compose(new THREE.Vector3(spot.x, 0.41 * scale + bob, spot.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.heading), new THREE.Vector3(scale, scale, scale));
      this.bodies.setMatrixAt(i, tmp);
      const headY = 0.95 * scale + bob;
      tmp.compose(new THREE.Vector3(spot.x, headY, spot.z), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
      this.heads.setMatrixAt(i, tmp);
      const cap = HAIR_HEIGHT[this.hairStyles[i] ?? 0] ?? 1;
      tmp.compose(new THREE.Vector3(spot.x, headY + 0.02 * scale, spot.z), new THREE.Quaternion(), new THREE.Vector3(scale, Math.max(0.001, cap * scale), scale));
      this.hair.setMatrixAt(i, tmp);
      tmp.compose(new THREE.Vector3(spot.x, headY + 0.34 * scale, spot.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.time * 2), new THREE.Vector3(1, 1, 1));
      this.badges.setMatrixAt(i, tmp);
      const code = s.jailed ? -2 : s.action;
      if (this.lastAction[i] !== code) {
        this.lastAction[i] = code;
        this.bodies.setColorAt(i, s.jailed ? new THREE.Color(JAILED_COLOR) : (this.outfits[i] ?? new THREE.Color("#888888")));
        this.badges.setColorAt(i, new THREE.Color(s.jailed ? JAILED_COLOR : (ACTION_COLORS[s.action] ?? "#4fa070")));
        if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
        if (this.badges.instanceColor) this.badges.instanceColor.needsUpdate = true;
      }
    }
    for (let i = 0; i < this.ids.length; i++) {
      if (visible.has(i)) continue;
      for (const m of [this.bodies, this.heads, this.hair, this.badges]) m.setMatrixAt(i, this.hidden);
      this.lastAction[i] = -1;
    }
    for (const m of [this.bodies, this.heads, this.hair, this.badges]) m.instanceMatrix.needsUpdate = true;

    if (this.selected !== null) {
      const pose = this.poseOf(this.selected);
      if (pose) {
        this.ring.visible = true;
        this.ring.position.set(pose.x, 0.05, pose.z);
        const target = this.controls.target;
        const dx = (pose.x - target.x) * 0.12;
        const dz = (pose.z - target.z) * 0.12;
        target.x += dx;
        target.z += dz;
        this.camera.position.x += dx;
        this.camera.position.z += dz;
      } else {
        this.ring.visible = false;
      }
    }
    this.controls.update();
    const distance = this.camera.position.distanceTo(this.controls.target);
    this.districtLabels.visible = distance > 55;
    this.workLabels.visible = distance <= 90;
    this.renderer.render(this.scene, this.camera);
  }
}
