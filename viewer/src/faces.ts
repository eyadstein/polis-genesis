/** Unique faces. Traits come from the person id, children blend their parents. */

export interface Face {
  skin: number; // 0..1 along the skin palette
  hair: number; // index into HAIR_COLORS
  hairStyle: number; // 0..4
  eyes: number; // index into EYE_COLORS
  eyeSize: number; // 0..1
  nose: number; // 0..1
  mouth: number; // 0..1
  faceWidth: number; // 0..1
  brow: number; // 0..1
}

export const SKIN_TONES = ["#f3d3b5", "#e6b98f", "#cf9a6b", "#a9774d", "#7d5434", "#563723"];
export const HAIR_COLORS = ["#16110d", "#3b2417", "#6b4423", "#a8742f", "#c9a14a", "#8a8a8a", "#a63a24"];
export const EYE_COLORS = ["#2a1c12", "#5a3a1e", "#3f6b4a", "#3d6a99", "#6e6e6e"];

function hash(n: number, salt: number): number {
  let h = (n * 2654435761 + salt * 40503) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function random(id: number): Face {
  return {
    skin: hash(id, 1),
    hair: Math.floor(hash(id, 2) * HAIR_COLORS.length),
    hairStyle: Math.floor(hash(id, 3) * 5),
    eyes: Math.floor(hash(id, 4) * EYE_COLORS.length),
    eyeSize: hash(id, 5),
    nose: hash(id, 6),
    mouth: hash(id, 7),
    faceWidth: hash(id, 8),
    brow: hash(id, 9),
  };
}

function clamp(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function blend(id: number, a: Face, b: Face): Face {
  const mix = (x: number, y: number, salt: number): number => {
    const w = 0.3 + 0.4 * hash(id, salt);
    return clamp(x * w + y * (1 - w) + (hash(id, salt + 50) - 0.5) * 0.1);
  };
  const pick = (x: number, y: number, salt: number): number => (hash(id, salt) < 0.5 ? x : y);
  return {
    skin: mix(a.skin, b.skin, 11),
    hair: pick(a.hair, b.hair, 12),
    hairStyle: hash(id, 13) < 0.2 ? Math.floor(hash(id, 14) * 5) : pick(a.hairStyle, b.hairStyle, 15),
    eyes: pick(a.eyes, b.eyes, 16),
    eyeSize: mix(a.eyeSize, b.eyeSize, 17),
    nose: mix(a.nose, b.nose, 18),
    mouth: mix(a.mouth, b.mouth, 19),
    faceWidth: mix(a.faceWidth, b.faceWidth, 20),
    brow: mix(a.brow, b.brow, 21),
  };
}

interface Lineage {
  id: number;
  parents: [number, number] | null;
}

/** Face for a person. Unknown parents fall back to a fresh random face. */
export function faceFor(
  id: number,
  byId: Map<number, Lineage>,
  cache: Map<number, Face> = new Map(),
  depth = 0,
): Face {
  const hit = cache.get(id);
  if (hit) return hit;
  const parents = byId.get(id)?.parents ?? null;
  let face: Face;
  if (parents && depth < 12) {
    face = blend(
      id,
      faceFor(parents[0], byId, cache, depth + 1),
      faceFor(parents[1], byId, cache, depth + 1),
    );
  } else {
    face = random(id);
  }
  cache.set(id, face);
  return face;
}

function skinColor(t: number): string {
  const i = Math.min(SKIN_TONES.length - 2, Math.floor(t * (SKIN_TONES.length - 1)));
  const f = t * (SKIN_TONES.length - 1) - i;
  const parse = (h: string): number[] => [1, 3, 5].map((k) => Number.parseInt(h.slice(k, k + 2), 16));
  const a = parse(SKIN_TONES[i] ?? "#000000");
  const b = parse(SKIN_TONES[i + 1] ?? "#000000");
  const c = a.map((v, k) => Math.round(v + ((b[k] ?? v) - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** SVG markup for a face, 100 by 100 viewBox. */
export function faceSvg(face: Face, size = 64, age = 30): string {
  const skin = skinColor(face.skin);
  const hair = HAIR_COLORS[face.hair];
  const eye = EYE_COLORS[face.eyes];
  const child = age < 16;
  const rx = 26 + face.faceWidth * 8;
  const ry = child ? 30 : 34;
  const cy = child ? 56 : 52;
  const eyeR = 3 + face.eyeSize * 2.5 + (child ? 1.5 : 0);
  const eyeY = cy - 4;
  const noseL = 6 + face.nose * 8;
  const mouthW = 8 + face.mouth * 10;
  const mouthY = cy + 18;
  const grey = age > 60;
  const hc = grey ? "#b9b9b9" : hair;
  const styles = [
    `<path d="M${50 - rx} ${cy - 6} Q50 ${cy - ry - 14} ${50 + rx} ${cy - 6} Q50 ${cy - 22} ${50 - rx} ${cy - 6}Z" fill="${hc}"/>`,
    `<path d="M${50 - rx - 3} ${cy + 14} L${50 - rx} ${cy - 8} Q50 ${cy - ry - 18} ${50 + rx} ${cy - 8} L${50 + rx + 3} ${cy + 14} Q${50 + rx} ${cy - 14} 50 ${cy - 20} Q${50 - rx} ${cy - 14} ${50 - rx - 3} ${cy + 14}Z" fill="${hc}"/>`,
    `<ellipse cx="50" cy="${cy - ry + 4}" rx="${rx + 2}" ry="9" fill="${hc}"/>`,
    `<path d="M${50 - rx} ${cy - 4} Q50 ${cy - ry - 16} ${50 + rx} ${cy - 4} L${50 + rx} ${cy - 14} Q50 ${cy - ry - 8} ${50 - rx} ${cy - 14}Z" fill="${hc}"/><circle cx="50" cy="${cy - ry - 6}" r="7" fill="${hc}"/>`,
    ``,
  ];
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img">`,
    `<ellipse cx="50" cy="${cy}" rx="${rx}" ry="${ry}" fill="${skin}"/>`,
    styles[face.hairStyle],
    `<circle cx="${50 - 11}" cy="${eyeY}" r="${eyeR}" fill="#fff"/><circle cx="${50 + 11}" cy="${eyeY}" r="${eyeR}" fill="#fff"/>`,
    `<circle cx="${50 - 11}" cy="${eyeY}" r="${eyeR * 0.6}" fill="${eye}"/><circle cx="${50 + 11}" cy="${eyeY}" r="${eyeR * 0.6}" fill="${eye}"/>`,
    `<path d="M${50 - 17} ${eyeY - 7 + face.brow * 2} L${50 - 6} ${eyeY - 7}M${50 + 6} ${eyeY - 7} L${50 + 17} ${eyeY - 7 + face.brow * 2}" stroke="${hc}" stroke-width="2" stroke-linecap="round"/>`,
    `<path d="M50 ${cy - 2} L${50 - 3} ${cy - 2 + noseL}L${50 + 3} ${cy - 2 + noseL}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.6" stroke-linecap="round"/>`,
    `<path d="M${50 - mouthW / 2} ${mouthY} Q50 ${mouthY + 5} ${50 + mouthW / 2} ${mouthY}" fill="none" stroke="#7a2e2e" stroke-width="2" stroke-linecap="round"/>`,
    `</svg>`,
  ].join("");
}