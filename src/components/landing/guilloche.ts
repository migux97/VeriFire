// Guilloché: the interlaced line work printed on banknotes and certificates to make them hard to copy. The landing
// draws it instead of photos. Each ring is one closed wavy curve, r(θ) = radius + amplitude·sin(waves·θ), repeated
// `copies` times, each copy turned a fraction of a wave so the lines cross into a mesh.

export const GUILLOCHE_SIZE = 400;
const CENTER = GUILLOCHE_SIZE / 2;
const STEPS = 540;

export interface GuillocheRing {
  path: string;
  // Rotation in degrees of every copy of the curve.
  turns: number[];
}

const ring = (radius: number, amplitude: number, waves: number, copies: number): GuillocheRing => {
  const points = Array.from({ length: STEPS }, (_, step) => {
    const angle = (step / STEPS) * Math.PI * 2;
    const r = radius + amplitude * Math.sin(waves * angle);
    return `${(CENTER + r * Math.cos(angle)).toFixed(1)} ${(CENTER + r * Math.sin(angle)).toFixed(1)}`;
  });
  const waveDegrees = 360 / waves;
  return {
    path: `M${points.join(' ')}Z`,
    turns: Array.from({ length: copies }, (_, copy) => (copy * waveDegrees) / copies)
  };
};

export const guillocheRings: GuillocheRing[] = [
  ring(176, 14, 28, 4),
  ring(128, 24, 18, 5),
  ring(78, 18, 12, 5),
  ring(34, 10, 8, 4)
];

// Plain circles that separate the bands, as on a printed seal.
export const guillocheCircles = [196, 154, 102, 54, 16];
export const guillocheCenter = CENTER;
