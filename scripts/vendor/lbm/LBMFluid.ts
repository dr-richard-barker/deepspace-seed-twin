// Vendored unchanged from LunarLeaf-CFD src/solver/lbm/LBMFluid.ts @ b5c18bd (MIT License,
// Copyright (c) 2026 Richard J. Barker and the LunarLeaf-CFD contributors). Validated there by
// four textbook gates (validation/gates.ts). Do not edit here; re-vendor instead.
import { Q, CX, CY, W, OPP, CS2, feq } from './d2q9';

export type Collision = 'bgk' | 'mrt';

/**
 * D2Q9 moment basis of Lallemand & Luo (2000), Phys. Rev. E 61:6546, for this
 * velocity ordering. Rows: rho, e, eps, jx, qx, jy, qy, pxx, pxy. The rows are
 * orthogonal, so M^-1 = M^T diag(1 / |row|^2).
 */
const MRT_M = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [-4, -1, -1, -1, -1, 2, 2, 2, 2],
  [4, -2, -2, -2, -2, 1, 1, 1, 1],
  [0, 1, 0, -1, 0, 1, -1, -1, 1],
  [0, -2, 0, 2, 0, 1, -1, -1, 1],
  [0, 0, 1, 0, -1, 1, 1, -1, -1],
  [0, 0, -2, 0, 2, 1, 1, -1, -1],
  [0, 1, -1, 1, -1, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, -1, 1, -1],
];
const MRT_M_FLAT = new Float64Array(MRT_M.flat());
const MRT_MINV = new Float64Array(81);
for (let k = 0; k < 9; k++) {
  const norm = MRT_M[k].reduce((s, v) => s + v * v, 0);
  for (let i = 0; i < 9; i++) MRT_MINV[i * 9 + k] = MRT_M[k][i] / norm;
}

/** Relaxation rates for the non-conserved, non-viscous MRT moments. */
export interface MrtRates {
  /** energy e (bulk viscosity) */
  se: number;
  /** energy square eps */
  seps: number;
  /** energy flux q; null = s_q = 8(2 - s_nu)/(8 - s_nu), the "magic" Lambda = 3/16 choice
   * that puts halfway bounce-back walls exactly mid-link for any viscosity */
  sq: number | null;
}
/** Lallemand & Luo (2000) values for e and eps. */
export const DEFAULT_MRT_RATES: MrtRates = { se: 1.64, seps: 1.54, sq: null };

/**
 * 2D incompressible-ish fluid solver, D2Q9 Lattice-Boltzmann with single-relaxation
 * (BGK, default) or multiple-relaxation-time (MRT, opt-in) collision and halfway
 * bounce-back walls. MRT relaxes density and momentum not at all, the shear stresses
 * at the same rate as BGK (so the viscosity is unchanged), and the remaining moments
 * at their own rates, which damps the non-hydrodynamic modes that destabilise BGK
 * under strong forcing.
 *
 * Boundary model
 * --------------
 * Solid cells (mask = 1) act as no-slip walls via halfway bounce-back. Each solid
 * cell carries a wall velocity (uwx, uwy); a static wall is simply uw = 0, while a
 * moving wall (e.g. the lid of a driven cavity) uses the standard momentum-corrected
 * bounce-back rule. Off-domain neighbours are treated as static walls. Inlet/outlet
 * conditions are applied by the scenario through the `postStream` hook.
 *
 * Forcing
 * -------
 * An optional per-cell body force (fx, fy) is integrated with the Guo (2002) scheme
 * and a half-force correction to the velocity. Milestone 1 flow benchmarks run with
 * no force; buoyancy (Boussinesq) will populate these arrays in Milestone 1's later
 * step and in the species coupling.
 *
 * All quantities are in lattice units (dx = dt = 1).
 */
export class LBMFluid {
  readonly nx: number;
  readonly ny: number;
  readonly size: number;
  tau: number;
  omega: number;

  f: Float32Array;
  ftmp: Float32Array;
  rho: Float32Array;
  ux: Float32Array;
  uy: Float32Array;

  /** 1 = solid (bounce-back wall), 0 = fluid. */
  solid: Uint8Array;
  /** Wall velocity for solid cells (used by moving walls; 0 for static). */
  uwx: Float32Array;
  uwy: Float32Array;

  /** Optional body force per cell; null disables the forcing branch entirely. */
  fx: Float32Array | null = null;
  fy: Float32Array | null = null;

  /** Collision scheme for fluids created from now on (validation scripts set this
   * once to run every scene with MRT). BGK keeps all published results unchanged. */
  static defaultCollision: Collision = 'bgk';
  collision: Collision = LBMFluid.defaultCollision;
  mrtRates: MrtRates = { ...DEFAULT_MRT_RATES };

  constructor(nx: number, ny: number, tau: number) {
    this.nx = nx;
    this.ny = ny;
    this.size = nx * ny;
    this.tau = tau;
    this.omega = 1 / tau;

    this.f = new Float32Array(Q * this.size);
    this.ftmp = new Float32Array(Q * this.size);
    this.rho = new Float32Array(this.size);
    this.ux = new Float32Array(this.size);
    this.uy = new Float32Array(this.size);
    this.solid = new Uint8Array(this.size);
    this.uwx = new Float32Array(this.size);
    this.uwy = new Float32Array(this.size);
  }

  setTau(tau: number): void {
    this.tau = tau;
    this.omega = 1 / tau;
  }

  index(x: number, y: number): number {
    return x + y * this.nx;
  }

  /** Enable the body-force arrays (allocates fx/fy). Idempotent. */
  enableForcing(): void {
    if (!this.fx) this.fx = new Float32Array(this.size);
    if (!this.fy) this.fy = new Float32Array(this.size);
  }

  /** Initialise every fluid cell to equilibrium at a uniform density and velocity. */
  setEquilibrium(rho0: number, ux0: number, uy0: number): void {
    for (let c = 0; c < this.size; c++) {
      this.rho[c] = rho0;
      this.ux[c] = ux0;
      this.uy[c] = uy0;
      const base = c * Q;
      for (let i = 0; i < Q; i++) this.f[base + i] = feq(i, rho0, ux0, uy0);
    }
  }

  /**
   * One timestep: fused macroscopic + BGK collision (with optional Guo forcing),
   * then push-streaming with bounce-back, then buffer swap.
   */
  collideAndStream(): void {
    const { nx, ny, f, omega, solid, fx, fy } = this;

    // --- collision (in place, f becomes post-collision) ---
    if (this.collision === 'mrt') this.collideMrt();
    else for (let c = 0; c < this.size; c++) {
      if (solid[c]) continue;
      const base = c * Q;

      let rho = 0;
      let mx = 0;
      let my = 0;
      for (let i = 0; i < Q; i++) {
        const fi = f[base + i];
        rho += fi;
        mx += CX[i] * fi;
        my += CY[i] * fi;
      }

      const Fx = fx ? fx[c] : 0;
      const Fy = fy ? fy[c] : 0;
      // Velocity includes the half-force correction (Guo scheme).
      const ux = (mx + 0.5 * Fx) / rho;
      const uy = (my + 0.5 * Fy) / rho;

      this.rho[c] = rho;
      this.ux[c] = ux;
      this.uy[c] = uy;

      const forceCoeff = 1 - 0.5 * omega;
      for (let i = 0; i < Q; i++) {
        const cix = CX[i];
        const ciy = CY[i];
        const eu = cix * ux + ciy * uy;
        const usq = ux * ux + uy * uy;
        const eqi = W[i] * rho * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * usq);

        let fi = f[base + i] - omega * (f[base + i] - eqi);

        if (fx || fy) {
          const gi =
            forceCoeff *
            W[i] *
            ((3 * (cix - ux) + 9 * eu * cix) * Fx +
              (3 * (ciy - uy) + 9 * eu * ciy) * Fy);
          fi += gi;
        }
        f[base + i] = fi;
      }
    }

    // --- streaming (push) with halfway bounce-back ---
    const ftmp = this.ftmp;
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const c = x + y * nx;
        if (solid[c]) continue;
        const base = c * Q;
        const rhoC = this.rho[c];

        for (let i = 0; i < Q; i++) {
          const xn = x + CX[i];
          const yn = y + CY[i];
          const fi = f[base + i];

          if (xn < 0 || xn >= nx || yn < 0 || yn >= ny) {
            // Off-domain: static wall bounce-back into the opposite slot of this cell.
            ftmp[base + OPP[i]] = fi;
            continue;
          }
          const n = xn + yn * nx;
          if (solid[n]) {
            // Moving/static wall bounce-back with momentum correction.
            const uwEu = CX[i] * this.uwx[n] + CY[i] * this.uwy[n];
            ftmp[base + OPP[i]] = fi - (2 * W[i] * rhoC * uwEu) / CS2;
          } else {
            ftmp[n * Q + i] = fi;
          }
        }
      }
    }

    // swap
    const tmp = this.f;
    this.f = this.ftmp;
    this.ftmp = tmp;
  }

  /**
   * MRT collision (Lallemand & Luo 2000) with Guo forcing in moment space:
   * m* = m - S (m - m_eq) + (I - S/2) M F. Conserved moments (rho, jx, jy) have s = 0,
   * so momentum gains exactly F per step, as with the BGK branch; the stresses relax
   * at s_nu = 1/tau, so the shear viscosity matches BGK at the same tau.
   */
  private collideMrt(): void {
    const { f, solid, fx, fy, omega } = this;
    const { se, seps } = this.mrtRates;
    const sq = this.mrtRates.sq ?? (8 * (2 - omega)) / (8 - omega);
    const S = [0, se, seps, 0, sq, 0, sq, omega, omega];
    const feqv = new Float64Array(Q);
    const src = new Float64Array(Q);
    const mpost = new Float64Array(Q);
    for (let c = 0; c < this.size; c++) {
      if (solid[c]) continue;
      const base = c * Q;
      let rho = 0;
      let mx = 0;
      let my = 0;
      for (let i = 0; i < Q; i++) {
        const fi = f[base + i];
        rho += fi;
        mx += CX[i] * fi;
        my += CY[i] * fi;
      }
      const Fx = fx ? fx[c] : 0;
      const Fy = fy ? fy[c] : 0;
      const ux = (mx + 0.5 * Fx) / rho;
      const uy = (my + 0.5 * Fy) / rho;
      this.rho[c] = rho;
      this.ux[c] = ux;
      this.uy[c] = uy;
      const usq = ux * ux + uy * uy;
      for (let i = 0; i < Q; i++) {
        const eu = CX[i] * ux + CY[i] * uy;
        feqv[i] = W[i] * rho * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * usq);
        src[i] = fx || fy
          ? W[i] * ((3 * (CX[i] - ux) + 9 * eu * CX[i]) * Fx + (3 * (CY[i] - uy) + 9 * eu * CY[i]) * Fy)
          : 0;
      }
      for (let k = 0; k < Q; k++) {
        let m = 0;
        let meq = 0;
        let fm = 0;
        for (let i = 0; i < Q; i++) {
          const mk = MRT_M_FLAT[k * 9 + i];
          if (mk === 0) continue;
          m += mk * f[base + i];
          meq += mk * feqv[i];
          fm += mk * src[i];
        }
        mpost[k] = m - S[k] * (m - meq) + (1 - 0.5 * S[k]) * fm;
      }
      for (let i = 0; i < Q; i++) {
        let fi = 0;
        for (let k = 0; k < Q; k++) fi += MRT_MINV[i * 9 + k] * mpost[k];
        f[base + i] = fi;
      }
    }
  }

  /** Recompute macroscopic fields from the current populations (for diagnostics/render). */
  computeMacroscopic(): void {
    const { f, solid, fx, fy } = this;
    for (let c = 0; c < this.size; c++) {
      if (solid[c]) {
        this.rho[c] = 1;
        this.ux[c] = 0;
        this.uy[c] = 0;
        continue;
      }
      const base = c * Q;
      let rho = 0;
      let mx = 0;
      let my = 0;
      for (let i = 0; i < Q; i++) {
        const fi = f[base + i];
        rho += fi;
        mx += CX[i] * fi;
        my += CY[i] * fi;
      }
      const Fx = fx ? fx[c] : 0;
      const Fy = fy ? fy[c] : 0;
      this.rho[c] = rho;
      this.ux[c] = (mx + 0.5 * Fx) / rho;
      this.uy[c] = (my + 0.5 * Fy) / rho;
    }
  }

  /** Speed |u| at a cell (call computeMacroscopic first for solid-safe values). */
  speed(c: number): number {
    return Math.hypot(this.ux[c], this.uy[c]);
  }

  /** Vorticity (∂uy/∂x − ∂ux/∂y) via central differences; 0 on the domain border. */
  vorticity(x: number, y: number): number {
    if (x <= 0 || x >= this.nx - 1 || y <= 0 || y >= this.ny - 1) return 0;
    const duy_dx = this.uy[this.index(x + 1, y)] - this.uy[this.index(x - 1, y)];
    const dux_dy = this.ux[this.index(x, y + 1)] - this.ux[this.index(x, y - 1)];
    return 0.5 * (duy_dx - dux_dy);
  }
}
