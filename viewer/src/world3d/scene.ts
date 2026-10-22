/** The 3D world: ground, buildings, lamps, sky, and the people walking in it. */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { faceFor, HAIR_COLORS, SKIN_TONES } from "../faces";
import { years } from "../stats";
import type { Person, Town } from "../types";
import { daylight, sunAngle } from "./clock";
import { FOUNTAIN_PLAZA_SIZE, hash01, pushOut, type Building, type Layout, type Road } from "./layout";
import type { Sample } from "./replay";
import { CHILD_FACTOR, FLOOR_HEIGHT, LAMP_HEIGHT, PERSON_SCALE } from "./scale";

const ACTION_COLORS = ["#d0873f", "#7a6ac4", "#d05a8c", "#3f7cd0", "#4fa070", "#26a8d8"];
const JAILED_COLOR = "#d9822b";
const HAIR_HEIGHT = [0.7, 1.3, 0.5, 1, 0];
const KIND_WALL: Record<string, string> = { Shack: "#a98c6a", House: "#e0cfae", Villa: "#f0e6d0", Flat: "#b9bcc4" };
const KIND_ROOF: Record<string, string> = { Shack: "#66513e", House: "#884b38", Villa: "#69404a", Flat: "#4b5665" };
const ADULT_YEARS = 16;
/** Most people the scene can hold. */
const CAPACITY = 3000;
const SKY_NIGHT = new THREE.Color("#060a18");
const SKY_DAY = new THREE.Color("#8ec5ff");
const SKY_DUSK = new THREE.Color("#f2a05a");
const SUN_DUSK = new THREE.Color("#ff9a55");

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
  private readonly places = new THREE.Group();
  private readonly signTextures = new Map<string, THREE.CanvasTexture>();
  private readonly faceCache = new Map();
  private windows!: Instanced;
  private readonly windowThreshold: number[] = [];
  private bulbs!: Instanced;
  private glow!: THREE.MeshBasicMaterial;
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
  private workLabels = new THREE.Group();
  private districtLabels = new THREE.Group();
  private selectedBuilding: Building | null = null;
  private readonly ring: THREE.Mesh;
  private readonly index = new Map<number, number>();
  private readonly ids: number[] = [];
  private readonly lastAction: number[] = [];
  private readonly poses: Pose[] = [];
  private readonly birthTicks: number[] = [];
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly visibleAt = new Uint32Array(CAPACITY);
  private visibilityFrame = 0;
  private readonly transform = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly yaw = new THREE.Quaternion();
  private readonly identity = new THREE.Quaternion();
  private readonly worldUp = new THREE.Vector3(0, 1, 0);
  private readonly spot = { x: 0, z: 0 };
  private readonly skyColor = new THREE.Color();
  private fountainJets: THREE.InstancedMesh | null = null;
  private readonly waterTime = { value: 0 };
  private trafficRoutes: { road: Road; phase: number; lane: number; speed: number }[] = [];
  private trafficMeshes: Instanced[] = [];
  private parkedCarCount = 0;
  private lastNight = -1;
  private selected: number | null = null;
  private time = 0;

  constructor(
    host: HTMLElement,
    private layout: Layout,
    town: Town,
  ) {
    this.center = new THREE.Vector3(layout.width / 2, 0, layout.depth / 2);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
    // Frame the coast, outer bridge, distant castle, and mountain backdrop together.
    this.camera.position.set(this.center.x - 8, 34, this.center.z + 50);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(this.center.x + 22, 0, this.center.z);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.05;
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 170;

    this.scene.background = new THREE.Color(SKY_DAY);
    this.scene.fog = new THREE.Fog(SKY_DAY, 70, 260);
    this.scene.add(this.sky, this.sun, this.moon, this.sun.target, this.moon.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const cam = this.sun.shadow.camera;
    cam.left = -48;
    cam.right = 48;
    cam.top = 48;
    cam.bottom = -48;
    cam.far = 220;
    this.sun.shadow.bias = -0.0005;

    this.scene.add(this.places);
    this.buildPlaces();
    this.stars = this.buildStars();

    const body = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    const head = new THREE.MeshStandardMaterial({ roughness: 0.6 });
    const hairMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    this.bodies = instanced(new THREE.CapsuleGeometry(0.16, 0.5, 3, 6), body, CAPACITY);
    this.heads = instanced(new THREE.SphereGeometry(0.14, 9, 7), head, CAPACITY);
    this.hair = instanced(new THREE.SphereGeometry(0.155, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), hairMaterial, CAPACITY);
    this.badges = instanced(new THREE.OctahedronGeometry(0.07), new THREE.MeshBasicMaterial({ toneMapped: false }), CAPACITY);
    this.syncPeople(town);
    for (const m of [this.bodies, this.heads, this.hair]) {
      m.castShadow = m === this.bodies;
      m.frustumCulled = false;
      this.scene.add(m);
    }
    this.badges.frustumCulled = false;
    this.scene.add(this.badges);
    this.outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: "#ffd98a", toneMapped: false }));
    this.outline.visible = false;
    this.scene.add(this.outline);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.28, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, toneMapped: false }),
    );
    this.ring.visible = false;
    this.scene.add(this.ring);

    this.watchClicks();
    new ResizeObserver(() => this.resize(host)).observe(host);
    this.resize(host);
  }

  /** Everything made of ground and buildings. Built again whenever the town grows. */
  private buildPlaces(): void {
    this.buildGround();
    this.buildMountainsAndCastle();
    this.buildBuildings();
    this.buildCars();
    this.buildTrees();
    ({ bulbs: this.bulbs, glow: this.glow } = this.buildLamps());
    this.windows = this.buildWindows();
    this.buildLabels();
    this.lastNight = -1;
  }

  /** Replace the buildings with a new layout, keeping the selected one if it still stands. */
  rebuildPlaces(layout: Layout): void {
    this.layout = layout;
    this.places.traverse((object) => {
      const thing = object as THREE.Mesh;
      thing.geometry?.dispose();
      const material = thing.material as THREE.Material | THREE.Material[] | undefined;
      for (const m of Array.isArray(material) ? material : material ? [material] : []) m.dispose();
    });
    this.places.clear();
    this.buildingList.length = 0;
    this.windowThreshold.length = 0;
    const kept = this.selectedBuilding;
    this.buildPlaces();
    if (kept) {
      const again = this.buildingList.find((b) => b.type === kept.type && b.x === kept.x && b.z === kept.z) ?? null;
      this.selectedBuilding = again;
      this.outline.visible = again !== null;
      if (!again) this.onBuilding(null);
    }
  }

  /** Make room for anyone the town has gained, and refresh what we know of everyone. */
  syncPeople(town: Town): void {
    const byId = new Map(town.people.map((p) => [p.id, p]));
    for (const p of town.people) {
      const known = this.index.get(p.id);
      if (known !== undefined) {
        this.birthTicks[known] = town.tick - p.age;
        continue;
      }
      if (this.ids.length >= CAPACITY) break;
      this.addPerson(p, byId, town.tick);
    }
    for (const m of [this.bodies, this.heads, this.hair, this.badges]) m.count = this.ids.length;
  }

  private addPerson(p: Person, byId: Map<number, Person>, tick: number): void {
    const i = this.ids.length;
    this.index.set(p.id, i);
    this.ids.push(p.id);
    this.birthTicks.push(tick - p.age);
    this.lastAction.push(-1);
    this.poses.push({ x: 0, z: 0, heading: 0, height: 1.7 });
    const f = faceFor(p.id, byId, this.faceCache);
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
    for (const m of [this.bodies, this.heads, this.hair]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
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
    this.places.add(grass);
    for (const d of this.layout.districts) {
      const districtGround = new THREE.Mesh(
        new THREE.PlaneGeometry(d.size, d.size).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.28 + d.hue * 0.035, 0.2, 0.34), roughness: 1 }),
      );
      districtGround.position.set(d.x + d.size / 2, 0, d.z + d.size / 2);
      districtGround.receiveShadow = true;
      this.places.add(districtGround);
    }

    const roads = instanced(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: "#4b5157", roughness: 0.96 }),
      this.layout.roads.length,
    );
    this.layout.roads.forEach((road, i) => {
      place(roads, i, road.x, 0.008, road.z, road.axis === "x" ? road.length : road.width, 1, road.axis === "x" ? road.width : road.length);
    });
    roads.receiveShadow = true;
    this.places.add(roads);

    const dashPositions: { x: number; z: number; axis: "x" | "z" }[] = [];
    for (const road of this.layout.roads) {
      const start = (road.axis === "x" ? road.x : road.z) - road.length / 2;
      const end = start + road.length;
      for (let along = Math.ceil((start - this.layout.slot / 2) / this.layout.slot) * this.layout.slot + this.layout.slot / 2; along < end - 0.3; along += this.layout.slot) {
        if (along <= start + 0.3) continue;
        dashPositions.push({ x: road.axis === "x" ? along : road.x, z: road.axis === "z" ? along : road.z, axis: road.axis });
      }
    }
    const dashCount = dashPositions.length;
    const roadMarks = instanced(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#d7c47c", toneMapped: false }),
      dashCount,
    );
    dashPositions.forEach((position, i) => {
      place(roadMarks, i, position.x, 0.018, position.z, position.axis === "x" ? 0.45 : 0.055, 1, position.axis === "x" ? 0.055 : 0.45);
    });
    this.places.add(roadMarks);

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
    this.places.add(lots);

    const plazas = instanced(
      new THREE.PlaneGeometry(FOUNTAIN_PLAZA_SIZE, FOUNTAIN_PLAZA_SIZE).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: "#777d79", roughness: 0.94 }),
      this.layout.fountains.length,
    );
    this.layout.fountains.forEach((fountain, i) => place(plazas, i, fountain.x, 0.026, fountain.z));
    plazas.receiveShadow = true;
    this.places.add(plazas);

    const waterMaterial = new THREE.MeshStandardMaterial({
      color: "#2389ba",
      roughness: 0.1,
      metalness: 0.1,
    });
    waterMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uWaveTime = this.waterTime;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uWaveTime;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\ntransformed.y += 0.075 * sin(position.x * 0.72 + uWaveTime * 1.35) * cos(position.z * 0.48 - uWaveTime);",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uWaveTime;")
        .replace(
          "#include <color_fragment>",
          "#include <color_fragment>\nfloat surf = sin(gl_FragCoord.x * 0.028 + gl_FragCoord.y * 0.016 + uWaveTime * 1.4);\ndiffuseColor.rgb *= 0.96 + 0.035 * surf;\ndiffuseColor.rgb += vec3(0.0, 0.012, 0.025) * (0.5 + 0.5 * surf);",
        );
    };
    waterMaterial.customProgramCacheKey = () => "polis-animated-surf-v1";
    const riverWidth = 14;
    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(riverWidth, depth + 200, 32, 160).rotateX(-Math.PI / 2),
      waterMaterial,
    );
    // Keep a single raised water sheet across the channel so waves stay above the terrain.
    river.position.set(width + 16, 0.12, this.center.z);
    river.receiveShadow = true;

    this.places.add(river);
    this.buildWaterfront();
    this.buildBridges();

    const fountains = this.layout.fountains ?? [];
    if (fountains.length > 0) {
      const stoneMat = new THREE.MeshStandardMaterial({ color: "#6e727c", roughness: 0.9 });
      const fountainWaterMat = new THREE.MeshStandardMaterial({
        color: "#2ab6e6",
        roughness: 0.15,
        transparent: true,
        opacity: 0.9,
      });
      const plumeMat = new THREE.MeshBasicMaterial({
        color: "#a5ecff",
        transparent: true,
        opacity: 0.8,
        toneMapped: false,
      });

      const basins = instanced(new THREE.CylinderGeometry(1.2, 1.25, 0.35, 16), stoneMat, fountains.length);
      const pools = instanced(new THREE.CylinderGeometry(1.05, 1.05, 0.36, 16), fountainWaterMat, fountains.length);
      const pillars = instanced(new THREE.CylinderGeometry(0.28, 0.32, 0.65, 12), stoneMat, fountains.length);
      const jets = instanced(new THREE.ConeGeometry(0.22, 0.55, 8), plumeMat, fountains.length);

      fountains.forEach((f, i) => {
        place(basins, i, f.x, 0.175, f.z);
        place(pools, i, f.x, 0.19, f.z);
        place(pillars, i, f.x, 0.325, f.z);
        place(jets, i, f.x, 0.75, f.z);
      });
      this.fountainJets = jets;
      this.places.add(basins, pools, pillars, jets);
    }
  }

  /** A single distant landmark sits on the far bank, away from every residential district. */
  private buildMountainsAndCastle(): void {
    const mountains = this.layout.mountains;
    if (mountains.length > 0) {
      const minX = Math.min(...mountains.map((mountain) => mountain.x - mountain.radius));
      const maxX = Math.max(...mountains.map((mountain) => mountain.x + mountain.radius));
      const minZ = Math.min(...mountains.map((mountain) => mountain.z - mountain.radius * 0.8));
      const maxZ = Math.max(...mountains.map((mountain) => mountain.z + mountain.radius * 0.8));
      const segmentsX = 72;
      const segmentsZ = 80;
      const positions = new Float32Array((segmentsX + 1) * (segmentsZ + 1) * 3);
      const colors = new Float32Array(positions.length);
      const indices: number[] = [];
      const low = new THREE.Color("#536a50");
      const mid = new THREE.Color("#77776b");
      const rock = new THREE.Color("#686a68");
      const snow = new THREE.Color("#e1e7e5");
      const peakColor = new THREE.Color();
      let maxHeight = 0;
      let vertex = 0;
      for (let iz = 0; iz <= segmentsZ; iz++) {
        const z = minZ + (maxZ - minZ) * iz / segmentsZ;
        for (let ix = 0; ix <= segmentsX; ix++) {
          const x = minX + (maxX - minX) * ix / segmentsX;
          let y = 0;
          for (let m = 0; m < mountains.length; m++) {
            const mountain = mountains[m]!;
            const nx = (x - mountain.x) / mountain.radius;
            const nz = (z - mountain.z) / (mountain.radius * 0.8);
            const distance = Math.hypot(nx, nz);
            const envelope = Math.max(0, 1 - distance);
            const ridgeA = Math.pow(Math.abs(Math.sin((nx * 2.7 + nz * 0.9 + m * 0.61) * Math.PI)), 5);
            const ridgeB = Math.pow(Math.abs(Math.sin((nz * 3.2 - nx * 1.4 + m * 0.37) * Math.PI)), 5);
            const ruggedness = 0.5 + 0.3 * ridgeA + 0.2 * ridgeB;
            y = Math.max(y, mountain.height * Math.pow(envelope, 0.88) * ruggedness);
          }
          const offset = vertex * 3;
          positions[offset] = x;
          positions[offset + 1] = y;
          positions[offset + 2] = z;
          maxHeight = Math.max(maxHeight, y);
          vertex++;
        }
      }
      for (let i = 0; i < positions.length; i += 3) {
        const peakRatio = (positions[i + 1] ?? 0) / maxHeight;
        if (peakRatio < 0.2) peakColor.copy(low).lerp(mid, peakRatio / 0.2);
        else if (peakRatio < 0.58) peakColor.copy(mid).lerp(rock, (peakRatio - 0.2) / 0.38);
        else peakColor.copy(rock).lerp(snow, THREE.MathUtils.smoothstep(peakRatio, 0.68, 0.87));
        colors[i] = peakColor.r;
        colors[i + 1] = peakColor.g;
        colors[i + 2] = peakColor.b;
      }
      for (let iz = 0; iz < segmentsZ; iz++) {
        for (let ix = 0; ix < segmentsX; ix++) {
          const a = iz * (segmentsX + 1) + ix;
          const b = a + segmentsX + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      const terrain = new THREE.BufferGeometry();
      terrain.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      terrain.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      terrain.setIndex(indices);
      terrain.computeVertexNormals();
      terrain.computeBoundingSphere();
      const range = new THREE.Mesh(terrain, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
      range.castShadow = true;
      range.receiveShadow = true;
      this.places.add(range);
    }

    const { castle, bridges } = this.layout;
    const approach = bridges[1];
    if (approach) {
      const approachLength = castle.x - (approach.x + approach.length / 2);
      const road = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.1, approachLength), 0.12, 2.6),
        new THREE.MeshStandardMaterial({ color: "#4b5157", roughness: 0.96 }),
      );
      road.position.set((castle.x + approach.x + approach.length / 2) / 2, (castle.elevation + 0.14) / 2, castle.z);
      road.rotation.z = Math.atan2(castle.elevation - 0.14, Math.max(0.1, approachLength));
      road.receiveShadow = true;
      this.places.add(road);
    }

    const baseY = castle.elevation;
    const wallHeight = 5;
    const size = 11;
    const opening = 2.8;
    const wallThickness = 0.8;
    const sideLength = (size - opening) / 2;
    const walls = instanced(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: "#b9ad96", roughness: 0.94 }),
      5,
    );
    const towers = instanced(
      new THREE.CylinderGeometry(1.05, 1.3, 7.2, 12),
      new THREE.MeshStandardMaterial({ color: "#c0b49b", roughness: 0.94 }),
      6,
    );
    const crenels = instanced(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: "#c7baa0", roughness: 0.93 }),
      68,
    );
    const keep = instanced(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: "#a89c84", roughness: 0.94 }),
      1,
    );
    const windows = instanced(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: "#343b42", roughness: 0.88 }),
      10,
    );
    const wallTop = baseY + wallHeight;
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(15, 0.65, 15),
      new THREE.MeshStandardMaterial({ color: "#85847d", roughness: 0.96 }),
    );
    plinth.position.set(castle.x, baseY - 0.325, castle.z);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    this.places.add(plinth);
    place(walls, 0, castle.x, baseY + wallHeight / 2, castle.z - size / 2, size, wallHeight, wallThickness);
    place(walls, 1, castle.x, baseY + wallHeight / 2, castle.z + size / 2, size, wallHeight, wallThickness);
    place(walls, 2, castle.x + size / 2, baseY + wallHeight / 2, castle.z, wallThickness, wallHeight, size);
    place(walls, 3, castle.x - size / 2, baseY + wallHeight / 2, castle.z - (opening + sideLength) / 2, wallThickness, wallHeight, sideLength);
    place(walls, 4, castle.x - size / 2, baseY + wallHeight / 2, castle.z + (opening + sideLength) / 2, wallThickness, wallHeight, sideLength);
    const corners: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    let crenel = 0;
    corners.forEach(([dx, dz], i) => {
      place(towers, i, castle.x + dx * size / 2, baseY + 3.6, castle.z + dz * size / 2);
    });
    corners.forEach(([dx, dz]) => {
      const centerX = castle.x + dx * size / 2;
      const centerZ = castle.z + dz * size / 2;
      for (let part = 0; part < 8; part++) {
        const angle = part * Math.PI / 4;
        place(crenels, crenel++, centerX + Math.cos(angle) * 1.12, baseY + 7.45, centerZ + Math.sin(angle) * 1.12, 0.44, 0.62, 0.44);
      }
    });
    // Two taller gatehouse towers make the bridge entrance the castle's clear front.
    place(towers, 4, castle.x - size / 2, baseY + 4, castle.z - opening / 2, 1.12, 1.1, 1.12);
    place(towers, 5, castle.x - size / 2, baseY + 4, castle.z + opening / 2, 1.12, 1.1, 1.12);
    for (const zOffset of [-opening / 2, opening / 2]) {
      for (let part = 0; part < 8; part++) {
        const angle = part * Math.PI / 4;
        place(crenels, crenel++, castle.x - size / 2 + Math.cos(angle) * 1.22, baseY + 8.15, castle.z + zOffset + Math.sin(angle) * 1.22, 0.38, 0.55, 0.38);
      }
    }

    for (const zSide of [-1, 1]) {
      for (let x = -4; x <= 4; x += 2) {
        place(crenels, crenel++, castle.x + x, wallTop + 0.35, castle.z + zSide * size / 2, 0.72, 0.7, 0.72);
      }
    }
    for (const xSide of [-1, 1]) {
      for (let z = -4; z <= 4; z += 2) {
        place(crenels, crenel++, castle.x + xSide * size / 2, wallTop + 0.35, castle.z + z, 0.72, 0.7, 0.72);
      }
    }
    place(keep, 0, castle.x + 1.1, baseY + 4.1, castle.z, 4.2, 7.6, 4.7);
    for (let i = 0; i < 5; i++) {
      place(windows, i, castle.x + 1.1, baseY + 2 + i * 0.9, castle.z + 2.38, 0.24, 0.62, 0.06);
      place(windows, i + 5, castle.x - 1.05 + i * 0.55, baseY + 3.2, castle.z + 2.38, 0.2, 0.52, 0.06);
    }
    const gateFrame = new THREE.Shape();
    gateFrame.moveTo(-2.1, 0);
    gateFrame.lineTo(-2.1, 5.2);
    gateFrame.lineTo(2.1, 5.2);
    gateFrame.lineTo(2.1, 0);
    gateFrame.lineTo(-1.4, 0);
    const gateOpening = new THREE.Path();
    gateOpening.moveTo(-1.4, 0);
    gateOpening.lineTo(-1.4, 2.45);
    gateOpening.absarc(0, 2.45, 1.4, Math.PI, 0, true);
    gateOpening.lineTo(1.4, 0);
    gateOpening.lineTo(-1.4, 0);
    gateFrame.holes.push(gateOpening);
    const gateFacade = new THREE.Mesh(
      new THREE.ExtrudeGeometry(gateFrame, { depth: 0.18, bevelEnabled: false, curveSegments: 8 }),
      new THREE.MeshStandardMaterial({ color: "#b9ad96", roughness: 0.94 }),
    );
    gateFacade.position.set(castle.x - size / 2 - 0.09, baseY, castle.z);
    gateFacade.rotation.y = Math.PI / 2;
    gateFacade.castShadow = true;
    gateFacade.receiveShadow = true;
    const doorShape = new THREE.Shape();
    doorShape.moveTo(-1.25, 0);
    doorShape.lineTo(-1.25, 2.35);
    doorShape.absarc(0, 2.35, 1.25, Math.PI, 0, true);
    doorShape.lineTo(1.25, 0);
    doorShape.lineTo(-1.25, 0);
    const gateDoor = new THREE.Mesh(
      new THREE.ShapeGeometry(doorShape, 8),
      new THREE.MeshStandardMaterial({ color: "#493c32", roughness: 0.92, side: THREE.DoubleSide }),
    );
    gateDoor.position.set(castle.x - size / 2 + 0.12, baseY, castle.z);
    gateDoor.rotation.y = Math.PI / 2;
    this.places.add(gateFacade, gateDoor);
    for (const mesh of [walls, towers, crenels, keep, windows]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.places.add(mesh);
    }
  }

  private buildWaterfront(): void {
    const { beach, promenade } = this.layout.waterfront;
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(beach.width, beach.length).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: "#d5c18b", roughness: 1 }),
    );
    sand.position.set(beach.x, 0.012, beach.z);
    sand.receiveShadow = true;
    this.places.add(sand);

    const boardwalk = new THREE.Mesh(
      new THREE.PlaneGeometry(promenade.width, promenade.length).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: "#8e6b4f", roughness: 0.9 }),
    );
    boardwalk.position.set(promenade.x, 0.025, promenade.z);
    boardwalk.receiveShadow = true;
    this.places.add(boardwalk);

    const umbrellaCount = Math.max(3, Math.floor(this.layout.depth / 16));
    const poles = instanced(
      new THREE.CylinderGeometry(0.025, 0.035, 1.1, 8),
      new THREE.MeshStandardMaterial({ color: "#e7dfca" }),
      umbrellaCount,
    );
    const canopies = instanced(
      new THREE.ConeGeometry(0.62, 0.32, 8),
      new THREE.MeshStandardMaterial({ roughness: 0.8 }),
      umbrellaCount,
    );
    const umbrellaColors = ["#e4745b", "#f0d26e", "#58a9a5", "#f3e9cf"];
    for (let i = 0; i < umbrellaCount; i++) {
      const z = beach.z - beach.length / 2 + 10 + i * ((beach.length - 20) / Math.max(1, umbrellaCount - 1));
      const x = beach.x + (i % 2 === 0 ? -1.4 : 1.4);
      place(poles, i, x, 0.55, z);
      place(canopies, i, x, 1.18, z);
      paint(canopies, i, umbrellaColors[i % umbrellaColors.length] ?? "#e4745b");
    }
    poles.castShadow = true;
    canopies.castShadow = true;
    this.places.add(poles, canopies);
  }

  private buildBridges(): void {
    const bridges = this.layout.bridges;
    const decks = instanced(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: "#777d7d", roughness: 0.88 }),
      bridges.length,
    );
    const centerLines = instanced(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: "#e2c96e", emissive: "#473711", roughness: 0.9 }),
      bridges.length,
    );
    const rails = instanced(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: "#d2d1c8", roughness: 0.72 }),
      bridges.length * 2,
    );
    const piers = instanced(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: "#656b70", roughness: 0.95 }),
      bridges.length * 2,
    );
    const gateStructure = instanced(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: "#b8ac91", roughness: 0.92 }),
      bridges.length * 5,
    );
    bridges.forEach((bridge, i) => {
      place(decks, i, bridge.x, 0.42, bridge.z, bridge.length, 0.22, bridge.width);
      place(centerLines, i, bridge.x, 0.536, bridge.z, bridge.length * 0.86, 0.018, 0.055);
      for (const side of [-1, 1]) {
        place(rails, i * 2 + (side > 0 ? 1 : 0), bridge.x, 0.78, bridge.z + side * (bridge.width / 2 - 0.04), bridge.length, 0.55, 0.08);
      }
      for (let support = 0; support < 2; support++) {
        const x = bridge.x + (support === 0 ? -1 : 1) * bridge.length * 0.22;
        place(piers, i * 2 + support, x, 0.02, bridge.z, 0.85, 0.78, bridge.width + 0.2);
      }
      const gateX = bridge.x - bridge.length / 2 + 1;
      for (const side of [-1, 1]) {
        const index = i * 5 + (side > 0 ? 1 : 0);
        place(gateStructure, index, gateX, 1.1, bridge.z + side * 1.62, 0.42, 2.2, 0.42);
        place(gateStructure, i * 5 + 3 + (side > 0 ? 1 : 0), gateX, 2.48, bridge.z + side * 1.62, 0.48, 0.24, 0.48);
      }
      place(gateStructure, i * 5 + 2, gateX, 2.12, bridge.z, 0.3, 0.28, 3.48);
    });
    for (const mesh of [decks, centerLines, rails, piers, gateStructure]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.places.add(mesh);
    }
  }

  private buildCars(): void {
    const cars = this.layout.cars;
    const candidates = this.layout.roads
      .filter((road) => road.axis === "x" && road.length >= 8)
      .sort((a, b) => a.z - b.z || a.x - b.x);
    const trafficCount = Math.min(8, candidates.length);
    this.trafficRoutes = Array.from({ length: trafficCount }, (_, i) => {
      const routeIndex = Math.floor((i + 0.5) * candidates.length / trafficCount);
      const road = candidates[routeIndex]!;
      return { road, phase: hash01(i + 200, 71), lane: i % 2 === 0 ? -0.1 : 0.1, speed: 0.7 + hash01(i + 200, 72) * 0.45 };
    });
    this.parkedCarCount = cars.length;
    const instanceCount = cars.length + trafficCount;
    const bodies = instanced(
      new THREE.BoxGeometry(0.92, 0.24, 0.36),
      new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.18 }),
      instanceCount,
    );
    const cabins = instanced(
      new THREE.BoxGeometry(0.52, 0.2, 0.3),
      new THREE.MeshStandardMaterial({ color: "#aac4ce", roughness: 0.24, metalness: 0.18 }),
      instanceCount,
    );
    const wheels = instanced(
      new THREE.CylinderGeometry(0.075, 0.075, 0.055, 8).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: "#20242a", roughness: 0.95 }),
      instanceCount * 4,
    );
    const lamps = instanced(
      new THREE.BoxGeometry(0.055, 0.05, 0.025),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      instanceCount * 4,
    );
    const populateCar = (i: number, x: number, z: number, color: string): void => {
      place(bodies, i, x, 0.2, z);
      paint(bodies, i, color);
      place(cabins, i, x - 0.025, 0.405, z);
      for (const xSide of [-1, 1]) {
        for (const zSide of [-1, 1]) {
          const wheel = i * 4 + (xSide > 0 ? 2 : 0) + (zSide > 0 ? 1 : 0);
          place(wheels, wheel, x + xSide * 0.27, 0.075, z + zSide * 0.17);
          const light = i * 4 + (xSide > 0 ? 2 : 0) + (zSide > 0 ? 1 : 0);
          place(lamps, light, x + xSide * 0.43, 0.215, z + zSide * 0.115);
          paint(lamps, light, xSide > 0 ? "#f4d99a" : "#a9443d");
        }
      }
    };
    cars.forEach((car, i) => populateCar(i, car.x, car.z, car.color));
    const trafficColors = ["#e5e4dc", "#4f6c89", "#b85e49", "#55595f", "#c4a74d", "#668b70"];
    this.trafficRoutes.forEach((route, i) => {
      const index = cars.length + i;
      const travel = Math.max(0.1, route.road.length - 1.6);
      const x = route.road.x - route.road.length / 2 + 0.8 + route.phase * travel;
      populateCar(index, x, route.road.z + route.lane, trafficColors[i % trafficColors.length] ?? "#e5e4dc");
    });
    bodies.castShadow = true;
    cabins.castShadow = true;
    wheels.castShadow = true;
    lamps.castShadow = false;
    this.trafficMeshes = [bodies, cabins, wheels, lamps];
    this.places.add(bodies, cabins, wheels, lamps);
  }

  private buildBuildings(): void {
    const { houses, workplaces } = this.layout;
    const bodies = instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85 }), houses.length + workplaces.length);
    const roofGeometry = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4);
    const roofs = instanced(roofGeometry, new THREE.MeshStandardMaterial({ roughness: 0.8 }), houses.length + workplaces.length);
    const flats = houses.filter((house) => house.kind === "Flat");
    const flatDetailCount = flats.reduce((count, flat) => count + 1 + Math.max(0, flat.floors - 1) * 2, 0);
    const details = instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.86 }), houses.length * 2 + flatDetailCount);
    this.buildingMesh = bodies;
    let n = 0;
    let detailIndex = houses.length * 2;
    houses.forEach((h, i) => {
      this.buildingList.push({ type: "house", ...h });
      place(bodies, n, h.x, h.h / 2, h.z, h.w, h.h, h.d);
      const wall = new THREE.Color(KIND_WALL[h.kind] ?? "#e0cfae");
      wall.offsetHSL((hash01(i, 77) - 0.5) * 0.04, 0, (hash01(i, 78) - 0.5) * 0.08);
      paint(bodies, n, wall);
      const roofH = h.kind === "Flat" ? 0.025 : h.kind === "Villa" ? 0.62 : h.kind === "Shack" ? 0.38 : 0.5;
      place(roofs, n, h.x, h.h + roofH / 2, h.z, h.w, roofH, h.d);
      const roofColor = new THREE.Color(KIND_ROOF[h.kind] ?? "#884b38").offsetHSL((hash01(i, 79) - 0.5) * 0.035, 0, (hash01(i, 80) - 0.5) * 0.08);
      paint(roofs, n, roofColor);
      const facadeZ = h.z + h.d / 2 + 0.024;
      place(details, i * 2, h.x, 0.37, facadeZ, 0.38, 0.72, 0.045);
      paint(details, i * 2, h.kind === "Shack" ? "#5b4434" : "#49352d");
      place(details, i * 2 + 1, h.x, 0.77, facadeZ, 0.52, 0.09, 0.07);
      paint(details, i * 2 + 1, h.kind === "Shack" ? "#a58a69" : "#d3bd98");
      if (h.kind === "Flat") {
        place(details, detailIndex, h.x, h.h + 0.045, h.z, h.w, 0.08, h.d);
        paint(details, detailIndex++, "#697783");
        for (let floor = 1; floor < h.floors; floor++) {
          const y = floor * FLOOR_HEIGHT.Flat;
          place(details, detailIndex, h.x, y - 0.045, facadeZ + 0.05, h.w * 0.78, 0.06, 0.14);
          paint(details, detailIndex++, "#a7adb1");
          place(details, detailIndex, h.x, y + 0.08, facadeZ + 0.125, h.w * 0.78, 0.15, 0.035);
          paint(details, detailIndex++, "#586c78");
        }
      }
      n++;
    });
    workplaces.forEach((w) => {
      this.buildingList.push({ type: "work", ...w });
      place(bodies, n, w.x, w.h / 2, w.z, w.w, w.h, w.d);
      paint(bodies, n, w.color);
      place(roofs, n, w.x, w.h + 0.035, w.z, w.w, 0.07, w.d);
      paint(roofs, n, "#3a3d44");
      n++;
    });
    for (const m of [bodies, roofs]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.places.add(m);
    }
    details.castShadow = false;
    details.receiveShadow = false;
    this.places.add(details);
  }

  private buildWindows(): Instanced {
    const spots: { x: number; y: number; z: number; rot: number; thr: number }[] = [];
    this.layout.houses.forEach((h, hi) => {
      const lived = h.occupants.length > 0;
      const base = lived ? hash01(hi, 400) * 0.55 : 2;
      for (let f = 0; f < h.floors; f++) {
        const floorH = FLOOR_HEIGHT[h.kind];
        const y = floorH * (f + 0.55);
        if (y > h.h - 0.1) continue;
        for (const dx of [-0.25, 0.25]) {
          spots.push({ x: h.x + dx * h.w, y, z: h.z + h.d / 2 + 0.01, rot: 0, thr: lived ? Math.min(0.95, base + hash01(hi * 9 + f, 11 + dx * 10) * 0.4) : 2 });
          spots.push({ x: h.x + h.w / 2 + 0.01, y, z: h.z + dx * h.d, rot: Math.PI / 2, thr: lived ? Math.min(0.95, base + hash01(hi * 9 + f, 21 + dx * 10) * 0.4) : 2 });
        }
      }
    });
    const mesh = instanced(new THREE.PlaneGeometry(0.24, 0.28), new THREE.MeshBasicMaterial({ toneMapped: false }), spots.length);
    spots.forEach((s, i) => {
      place(mesh, i, s.x, s.y, s.z, 1, 1, 1, s.rot);
      this.windowThreshold.push(s.thr);
      paint(mesh, i, "#2b3b4d");
    });
    this.places.add(mesh);
    return mesh;
  }

  private buildTrees(): void {
    const { trees } = this.layout;
    const trunks = instanced(new THREE.CylinderGeometry(0.07, 0.1, 0.6, 6), new THREE.MeshStandardMaterial({ color: "#5a3d27" }), trees.length);
    const conifers = trees.filter((tree) => tree.type === "conifer");
    const deciduous = trees.filter((tree) => tree.type === "deciduous");
    const needles = instanced(new THREE.ConeGeometry(0.5, 1.4, 7), new THREE.MeshStandardMaterial({ roughness: 0.92 }), conifers.length);
    const leaves = instanced(new THREE.IcosahedronGeometry(0.52, 0), new THREE.MeshStandardMaterial({ roughness: 0.94 }), deciduous.length);
    let coniferIndex = 0;
    let deciduousIndex = 0;
    trees.forEach((t, i) => {
      place(trunks, i, t.x, 0.3 * t.s, t.z, t.s, t.s, t.s);
      const index = t.type === "conifer" ? coniferIndex++ : deciduousIndex++;
      const crown = t.type === "conifer" ? needles : leaves;
      const y = t.type === "conifer" ? (0.6 + 0.7) * t.s : (0.6 + 0.52) * t.s;
      place(crown, index, t.x, y, t.z, t.s, t.s, t.s);
      paint(crown, index, new THREE.Color().setHSL((t.type === "conifer" ? 0.31 : 0.29) + hash01(i, 2) * 0.06, 0.5, 0.28 + hash01(i, 3) * 0.1));
    });
    trunks.castShadow = true;
    needles.castShadow = false;
    leaves.castShadow = false;
    this.places.add(trunks, needles, leaves);
  }

  private buildLamps(): { bulbs: Instanced; glow: THREE.MeshBasicMaterial } {
    const { lamps } = this.layout;
    const poles = instanced(new THREE.CylinderGeometry(0.025, 0.03, LAMP_HEIGHT, 6), new THREE.MeshStandardMaterial({ color: "#2c2f36" }), lamps.length);
    const bulbs = instanced(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), lamps.length);
    const glow = new THREE.MeshBasicMaterial({ color: "#ffcf80", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const pools = instanced(new THREE.CircleGeometry(1.8, 24).rotateX(-Math.PI / 2), glow, lamps.length);
    lamps.forEach((l, i) => {
      place(poles, i, l.x, LAMP_HEIGHT / 2, l.z);
      place(bulbs, i, l.x, LAMP_HEIGHT + 0.04, l.z);
      paint(bulbs, i, "#555555");
      place(pools, i, l.x, 0.04, l.z);
    });
    this.places.add(poles, bulbs, pools);
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
      const hit = [...ray.intersectObject(this.bodies), ...ray.intersectObject(this.heads)].sort((a, b) => a.distance - b.distance)[0];
      // People are small next to buildings, so a click near one counts as a click on them.
      const people = hit ?? this.nearestPerson(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
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
    const key = `${text}|${color}`;
    let texture = this.signTextures.get(key);
    if (!texture) {
      const drawn = this.drawSign(text, color);
      if (!drawn) return null;
      texture = drawn;
      this.signTextures.set(key, texture);
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, fog: false }));
    sprite.scale.set(width, width / 4, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  private drawSign(text: string, color: string): THREE.CanvasTexture | null {
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
    return new THREE.CanvasTexture(canvas);
  }

  private buildLabels(): void {
    this.workLabels = new THREE.Group();
    this.districtLabels = new THREE.Group();
    for (const w of this.layout.workplaces) {
      const sign = this.sign(w.title, 3, "#ffe9b0");
      if (!sign) continue;
      sign.position.set(w.x, w.h + 0.5, w.z);
      this.workLabels.add(sign);
    }
    for (const d of this.layout.districts) {
      const sign = this.sign(d.name, 11, "#ffffff");
      if (!sign) continue;
      sign.position.set(d.x + d.size / 2, 4, d.z + d.size / 2);
      this.districtLabels.add(sign);
    }
    this.places.add(this.workLabels, this.districtLabels);
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

  /** The person drawn closest to a screen point, if one is within a few pixels. */
  private nearestPerson(px: number, py: number, width: number, height: number): { instanceId: number; distance: number } | undefined {
    let best: { instanceId: number; distance: number } | undefined;
    let bestGap = 18;
    const point = new THREE.Vector3();
    for (let i = 0; i < this.ids.length; i++) {
      const pose = this.poses[i];
      if (!pose || this.lastAction[i] === -1) continue;
      point.set(pose.x, pose.height, pose.z);
      const distance = this.camera.position.distanceTo(point);
      point.project(this.camera);
      if (point.z > 1) continue;
      const gap = Math.hypot(((point.x + 1) / 2) * width - px, ((1 - point.y) / 2) * height - py);
      if (gap < bestGap) {
        bestGap = gap;
        best = { instanceId: i, distance };
      }
    }
    return best;
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
    this.skyColor.copy(SKY_NIGHT).lerp(SKY_DAY, day).lerp(SKY_DUSK, dusk * 0.55);
    (this.scene.background as THREE.Color).copy(this.skyColor);
    (this.scene.fog as THREE.Fog).color.copy(this.skyColor);
    const a = sunAngle(tick);
    const elevation = Math.max(0.12, Math.sin(a));
    this.sun.position.set(this.center.x + Math.cos(a) * 90, elevation * 90, this.center.z + 35);
    this.sun.target.position.copy(this.center);
    this.sun.intensity = 2.6 * day;
    this.sun.color.set("#ffffff").lerp(SUN_DUSK, dusk * 0.7);
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
    this.waterTime.value = (this.waterTime.value + Math.min(seconds, 0.1)) % 1000;
    this.applyLight(tick);
    this.visibilityFrame = (this.visibilityFrame + 1) >>> 0;
    if (this.visibilityFrame === 0) {
      this.visibleAt.fill(0);
      this.visibilityFrame = 1;
    }
    const visibilityFrame = this.visibilityFrame;
    for (const s of samples) {
      const i = this.index.get(s.id);
      if (i === undefined) continue;
      this.visibleAt[i] = visibilityFrame;
      const spot = pushOut(this.layout, s.x + 0.5, s.y + 0.5, this.spot);
      const pose = this.poses[i] as Pose;
      const dx = spot.x - pose.x;
      const dz = spot.z - pose.z;
      const moved = Math.hypot(dx, dz);
      if (this.lastAction[i] !== -1 && moved > 0.01 && moved < 6) pose.heading = Math.atan2(dx, dz);
      pose.x = spot.x;
      pose.z = spot.z;
      const adult = years(Math.max(0, tick - (this.birthTicks[i] ?? 0))) >= ADULT_YEARS;
      const scale = (adult ? 1 : CHILD_FACTOR) * (this.statures[i] ?? 1) * PERSON_SCALE;
      pose.height = 1.7 * scale * 0.5;
      const bob = Math.abs(Math.sin(this.time * 7 + i)) * (s.action === 1 ? 0 : 0.03);
      this.position.set(spot.x, 0.41 * scale + bob, spot.z);
      this.yaw.setFromAxisAngle(this.worldUp, pose.heading);
      this.scale.set(scale, scale, scale);
      this.transform.compose(this.position, this.yaw, this.scale);
      this.bodies.setMatrixAt(i, this.transform);
      const headY = 0.95 * scale + bob;
      this.position.set(spot.x, headY, spot.z);
      this.transform.compose(this.position, this.identity, this.scale);
      this.heads.setMatrixAt(i, this.transform);
      const cap = HAIR_HEIGHT[this.hairStyles[i] ?? 0] ?? 1;
      this.position.set(spot.x, headY + 0.02 * scale, spot.z);
      this.scale.set(scale, Math.max(0.001, cap * scale), scale);
      this.transform.compose(this.position, this.identity, this.scale);
      this.hair.setMatrixAt(i, this.transform);
      this.position.set(spot.x, headY + 0.34 * scale, spot.z);
      this.yaw.setFromAxisAngle(this.worldUp, this.time * 2);
      this.scale.set(0.6, 0.6, 0.6);
      this.transform.compose(this.position, this.yaw, this.scale);
      this.badges.setMatrixAt(i, this.transform);
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
      if (this.visibleAt[i] === visibilityFrame) continue;
      for (const m of [this.bodies, this.heads, this.hair, this.badges]) m.setMatrixAt(i, this.hidden);
      this.lastAction[i] = -1;
    }
    for (const m of [this.bodies, this.heads, this.hair, this.badges]) m.instanceMatrix.needsUpdate = true;

    this.trafficRoutes.forEach((route, routeIndex) => {
      const travel = Math.max(0.1, route.road.length - 1.6);
      const progress = (this.time * route.speed + route.phase * travel) % travel;
      const x = route.road.x - route.road.length / 2 + 0.8 + progress;
      const z = route.road.z + route.lane;
      const carIndex = this.parkedCarCount + routeIndex;
      const [bodies, cabins, wheels, lamps] = this.trafficMeshes as [Instanced, Instanced, Instanced, Instanced];
      this.scale.set(1, 1, 1);
      this.position.set(x, 0.2, z);
      this.transform.compose(this.position, this.identity, this.scale);
      bodies.setMatrixAt(carIndex, this.transform);
      this.position.set(x - 0.025, 0.405, z);
      this.transform.compose(this.position, this.identity, this.scale);
      cabins.setMatrixAt(carIndex, this.transform);
      for (let xSide = -1; xSide <= 1; xSide += 2) {
        for (let zSide = -1; zSide <= 1; zSide += 2) {
          const partIndex = carIndex * 4 + (xSide > 0 ? 2 : 0) + (zSide > 0 ? 1 : 0);
          this.position.set(x + xSide * 0.27, 0.075, z + zSide * 0.17);
          this.transform.compose(this.position, this.identity, this.scale);
          wheels.setMatrixAt(partIndex, this.transform);
          this.position.set(x + xSide * 0.43, 0.215, z + zSide * 0.115);
          this.transform.compose(this.position, this.identity, this.scale);
          lamps.setMatrixAt(partIndex, this.transform);
        }
      }
    });
    if (this.trafficRoutes.length > 0) for (const mesh of this.trafficMeshes) mesh.instanceMatrix.needsUpdate = true;

    if (this.fountainJets) {
      const pulse = 1 + Math.sin(this.time * 5) * 0.15;
      const fountains = this.layout.fountains ?? [];
      fountains.forEach((f, i) => {
        this.position.set(f.x, 0.65 + pulse * 0.1, f.z);
        this.scale.set(1, pulse, 1);
        this.transform.compose(this.position, this.identity, this.scale);
        this.fountainJets!.setMatrixAt(i, this.transform);
      });
      this.fountainJets.instanceMatrix.needsUpdate = true;
    }

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
    this.districtLabels.visible = distance > 82;
    this.workLabels.visible = distance <= 58;
    this.renderer.render(this.scene, this.camera);
  }
}
