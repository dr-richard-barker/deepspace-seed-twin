// Seeded PRNG (mulberry32). The ONLY source of randomness in the model: it is used for
// between-seed parameter variability in population runs, never to generate "data".
// The platform's unseeded generator is banned in app/src/model by a validation gate.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller from a seeded uniform source. */
export function normal(u: () => number): number {
  const u1 = Math.max(u(), 1e-12);
  const u2 = u();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
