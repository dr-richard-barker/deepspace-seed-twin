// Vendored unchanged from LunarLeaf-CFD src/solver/lbm/d2q9.ts @ b5c18bd (MIT License,
// Copyright (c) 2026 Richard J. Barker and the LunarLeaf-CFD contributors). Validated there by
// four textbook gates (validation/gates.ts). Do not edit here; re-vendor instead.
/**
 * D2Q9 lattice constants.
 *
 * Velocity ordering (index i):
 *   0: ( 0, 0)   rest
 *   1: ( 1, 0)   2: ( 0, 1)   3: (-1, 0)   4: ( 0,-1)      axis
 *   5: ( 1, 1)   6: (-1, 1)   7: (-1,-1)   8: ( 1,-1)      diagonal
 *
 * All quantities are in lattice units (dx = dt = 1). Physical scaling is applied
 * by the caller via the chosen characteristic velocity and length.
 */
export const Q = 9;

export const CX = new Int8Array([0, 1, 0, -1, 0, 1, -1, -1, 1]);
export const CY = new Int8Array([0, 0, 1, 0, -1, 1, 1, -1, -1]);

/** Lattice weights w_i. Sum = 1. */
export const W = new Float64Array([
  4 / 9,
  1 / 9, 1 / 9, 1 / 9, 1 / 9,
  1 / 36, 1 / 36, 1 / 36, 1 / 36,
]);

/** Index of the opposite velocity: e_OPP[i] = -e_i. Used for bounce-back. */
export const OPP = new Uint8Array([0, 3, 4, 1, 2, 7, 8, 5, 6]);

/** Lattice speed of sound squared, cs^2 = 1/3. */
export const CS2 = 1 / 3;

/**
 * Relaxation time from kinematic viscosity (lattice units): nu = cs^2 (tau - 1/2).
 * tau must exceed 0.5 for a positive, stable viscosity.
 */
export function tauFromViscosity(nu: number): number {
  return nu / CS2 + 0.5;
}

/** Kinematic viscosity (lattice units) from a target Reynolds number. */
export function viscosityFromRe(u: number, length: number, Re: number): number {
  return (u * length) / Re;
}

/** Equilibrium distribution f_i^eq for one direction. */
export function feq(i: number, rho: number, ux: number, uy: number): number {
  const eu = CX[i] * ux + CY[i] * uy;
  const usq = ux * ux + uy * uy;
  return W[i] * rho * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * usq);
}
