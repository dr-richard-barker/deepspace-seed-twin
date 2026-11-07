// Air speed at the seed bed of the LEAF GBC1 chamber from a 2-D lattice-Boltzmann run with
// the LunarLeaf-CFD solver (vendored in scripts/vendor/lbm). Writes results/tables/
// seed_air_speed.csv, which scripts/build_environments.py reads into the leaf_gbc1 preset.
//
// Geometry (LEAF_GBC2_pot_model README §1): axial Z −30.5…+30.5 mm (three compartments),
// vertical from the substrate top (Y = 14.62 mm) to the lid underside (Y = 32.40 mm).
// Germination phase: no canopy. Air enters both lateral ends through the upper perimeter
// distribution channel (Y = 28–32 mm) and leaves through Port 2 (Ø 3.18 mm) in the lid
// directly above the central (Arabidopsis) compartment. The 2-D slice carries the pump
// flow per unit of pot width (internal width taken as the 45.09 mm lid width — TODO confirm).
// Output: mean speed in the first fluid row above the substrate (cell centre 0.144 mm, about
// one seed radius) over the central compartment (|Z| < 7.5 mm).
// No buoyancy source is present during germination (seed respiration is negligible at
// this scale), so the steady flow — and the result — does not depend on gravity.
import { mkdirSync, writeFileSync } from "node:fs";
import { LBMFluid } from "./vendor/lbm/LBMFluid";
import { CX, CY, feq, tauFromViscosity } from "./vendor/lbm/d2q9";

const DX = 0.288e-3; // m per cell (LunarLeaf resolution)
const NU_PHYS = 1.55e-5; // m²/s, ledger nu_air_m2s at 25 °C
const NU_LAT = 0.1;
const DT = (NU_LAT * DX * DX) / NU_PHYS; // s per step
const U_UNIT = DX / DT; // m/s per lattice velocity unit
const W_POT = 45.09e-3; // m, lid X width (TODO: internal width)
const cells = (mm: number) => Math.round((mm * 1e-3) / DX);

function run(qLmin: number) {
  const nz = cells(61) + 2;
  const ny = cells(32.4 - 14.62) + 2;
  const fluid = new LBMFluid(nz, ny, tauFromViscosity(NU_LAT));
  fluid.setEquilibrium(1, 0, 0);
  // walls everywhere on the frame
  for (let x = 0; x < nz; x++) for (const y of [0, ny - 1]) fluid.solid[fluid.index(x, y)] = 1;
  for (let y = 0; y < ny; y++) for (const x of [0, nz - 1]) fluid.solid[fluid.index(x, y)] = 1;
  // inlets: Y 28–32 mm on both ends; outlet: Ø 3.18 mm in the lid at Z = 0
  const y0 = cells(28 - 14.62);
  const y1 = Math.min(ny - 2, cells(32 - 14.62));
  const inletRows: number[] = [];
  for (let y = y0; y <= y1; y++) inletRows.push(y);
  for (const y of inletRows) {
    fluid.solid[fluid.index(0, y)] = 0;
    fluid.solid[fluid.index(nz - 1, y)] = 0;
  }
  const half = Math.max(1, Math.round(cells(3.18) / 2));
  const mid = Math.floor(nz / 2);
  const outlet: number[] = [];
  for (let x = mid - half; x <= mid + half; x++) {
    fluid.solid[fluid.index(x, ny - 1)] = 0;
    outlet.push(x);
  }
  // inlet speed: half the flow per unit width through each end band
  const q = (qLmin / 60000) / W_POT; // m²/s per unit width
  const uIn = q / 2 / (inletRows.length * DX); // m/s
  const uLat = uIn / U_UNIT;
  const bc = () => {
    for (const y of inletRows) {
      const l = fluid.index(0, y) * 9;
      const r = fluid.index(nz - 1, y) * 9;
      for (let i = 0; i < 9; i++) {
        fluid.f[l + i] = feq(i, 1, uLat, 0);
        fluid.f[r + i] = feq(i, 1, -uLat, 0);
      }
    }
    for (const x of outlet) {
      const co = fluid.index(x, ny - 1) * 9;
      const cs = fluid.index(x, ny - 2) * 9;
      let rho = 0, mx = 0, my = 0;
      for (let i = 0; i < 9; i++) {
        const fi = fluid.f[cs + i];
        rho += fi;
        mx += CX[i] * fi;
        my += CY[i] * fi;
      }
      const vx = mx / rho, vy = my / rho;
      for (let i = 0; i < 9; i++) fluid.f[co + i] = feq(i, 1, vx, vy) + (fluid.f[cs + i] - feq(i, rho, vx, vy));
    }
  };
  const bed = () => {
    let s = 0, n = 0;
    for (let x = 1; x < nz - 1; x++) {
      const zmm = (x - nz / 2) * DX * 1e3;
      if (Math.abs(zmm) < 7.5) {
        s += fluid.speed(fluid.index(x, 1));
        n++;
      }
    }
    return (s / n) * U_UNIT;
  };
  // throughput: flux through the open port cells (vertical velocity × width)
  const outflow = () => {
    let o = 0;
    for (const x of outlet) {
      const c = fluid.index(x, ny - 1) * 9;
      let rho = 0, my = 0;
      for (let i = 0; i < 9; i++) {
        rho += fluid.f[c + i];
        my += CY[i] * fluid.f[c + i];
      }
      o += (my / rho) * U_UNIT * DX;
    }
    return o;
  };
  let prev = 0;
  let steps = 0;
  const minSteps = Math.ceil(40 / DT); // ≥ 2 diffusive times h²/ν
  const maxSteps = Math.ceil(200 / DT);
  for (; steps < maxSteps; steps++) {
    fluid.collideAndStream();
    bc();
    if (steps % 2000 === 1999) {
      fluid.computeMacroscopic();
      const u = bed();
      const mb = outflow() / q;
      if (steps > minSteps && Math.abs(u - prev) / Math.max(u, 1e-12) < 1e-5 && Math.abs(mb - 1) < 0.02) break;
      prev = u;
    }
  }
  fluid.computeMacroscopic();
  const out = outflow();
  return { u: bed(), steps, seconds: steps * DT, uIn, ma: uLat * Math.sqrt(3), massBalance: out / q, nz, ny };
}

mkdirSync("results/tables", { recursive: true });
const rows = ["job,hardware,gravity_g,pump_l_min,u_seed_m_s,u_inlet_m_s,steps,sim_seconds,mach,outflow_over_inflow,grid"];
for (const qLmin of [0.25, 0.5, 0.85]) {
  const r = run(qLmin);
  console.log(`Q ${qLmin} L/min: u_bed ${(r.u * 1000).toFixed(3)} mm/s after ${r.seconds.toFixed(1)} s (${r.steps} steps), mass balance ${r.massBalance.toFixed(3)}`);
  // no buoyancy driver during germination: the same steady flow at every g
  for (const g of [0, 0.165, 1]) rows.push(`gbc1_q${qLmin}_g${g},leaf_gbc1,${g},${qLmin},${r.u.toExponential(4)},${r.uIn.toExponential(4)},${r.steps},${r.seconds.toFixed(2)},${r.ma.toFixed(4)},${r.massBalance.toFixed(4)},${r.nz}x${r.ny}`);
}
writeFileSync("results/tables/seed_air_speed.csv", rows.join("\n") + "\n");
console.log("wrote results/tables/seed_air_speed.csv");
