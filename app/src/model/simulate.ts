// The seed twin: one seed (dry seed → ~5-day seedling) in one environment.
//
// Each step (dt hours) runs, in order:
//   water   seed-level imbibition (phases I–II) + growth-coupled uptake (phase III) → turgor
//   gas     respiration demand, O2 / CO2 / ethylene through the boundary-layer–film–testa–
//           endosperm series path; per-cell O2 from the radial profile; headspace balance
//   energy  reserve use; aerobic vs fermentative yield per cell
//   radiation  per-cell damage/ROS from the dose rate (cell-type sensitivity from the decoder)
//   hormones   per-cell ABA / GA / DELLA / ACC network
//   growth  pre-germination: Lockhart wall-stress growth per slice under seed-coat restraint;
//           post-germination: seedling kinematics (seedling.ts)
// Every rate constant is read from the parameter ledger via p().
import { buildTemplate, Region, Tissue, meanLen, axisLength, type Template } from "./geometry";
import { buildGraph, type Graph } from "./graph";
import { allocLayout, computeLayout, initialPose, type Layout, type OrganPose } from "./layout";
import { p, type Params } from "./params";
import { doseRate, lightOn, type Env } from "./environment";
import { R_GAS, seedShape, transport, waterFilm, cylinderDrop, slabDrop, type SeedShape, type Transport } from "./gas";
import { allocHormones, growthResponse, initHormones, maxStableDu, stepHormones, type HormoneState } from "./hormones";
import { initSeedling, stepSeedling, type SeedlingState } from "./seedling";

export interface Milestones {
  testaRupture: number | null;
  endospermRupture: number | null;
  anchored: number | null;
  cotEmerged: number | null;
  cotOpen: number | null;
}

export interface Sample {
  t: number;
  water_gg: number;
  hydration: number;
  turgor_mpa: number;
  restraint_mpa: number;
  cap_strength_mpa: number;
  o2_hs_kpa: number;
  o2_surface_kpa: number;
  o2_tip_kpa: number;
  o2_collet_kpa: number;
  o2_core_min_kpa: number;
  hypoxic_frac: number;
  co2_int_kpa: number;
  eth_hs_ppb: number;
  eth_int_ppb: number;
  eth_prod_pl_h: number;
  aba_tip: number;
  aba_collet: number;
  ga_tip: number;
  ga_collet: number;
  integ_tip: number;
  integ_collet: number;
  aba_mean: number;
  axis_len_um: number;
  root_len_um: number;
  hyp_len_um: number;
  reserve: number;
  dose_mgy: number;
  resp_nmol_h: number;
  energy_tip: number;
  hook_deg: number;
  root_angle_deg: number;
  sherwood: number;
}

export interface SimOptions {
  dt?: number;
  sampleEvery?: number;
  /** stop after germination (endosperm rupture) — used by population runs */
  germinationOnly?: boolean;
  /** cell-type radiation sensitivity, by cell index (defaults to 1) */
  radSensitivity?: (sim: SeedTwin) => Float64Array;
}

const PA_PER_KPA = 1000;
/** hours after imbibition at which Bassel et al. 2014 report embryo cell expansion */
export const PROFILE_TIMES = [3, 6, 16, 22, 28, 32];

export class SeedTwin {
  readonly params: Params;
  env: Env;
  readonly template: Template;
  graph: Graph;
  readonly layout: Layout;
  readonly pose: OrganPose;
  readonly shape: SeedShape;
  readonly h: HormoneState;
  readonly seedling: SeedlingState;
  t = 0;
  readonly dt: number;
  readonly sampleEvery: number;
  readonly germinationOnly: boolean;
  samples: Sample[] = [];
  /** cortical cell volume by QC index captured at the Bassel 2014 timepoints */
  profiles = new Map<number, { index: number; volume: number }[]>();
  milestones: Milestones = { testaRupture: null, endospermRupture: null, anchored: null, cotEmerged: null, cotOpen: null };

  // seed-level state
  water: number; // g water / g dry seed
  hydration = 0;
  activation = 0;
  turgor = 0;
  restraint = 0;
  capStrength: number;
  strainAtTesta = 0;
  reserve = 1;
  dose = 0;
  ethInt = 0; // Pa
  respiration = 0; // mol/s per seed
  hs = { o2: 0, co2: 0, eth: 0 }; // headspace partial pressures (Pa)
  o2Surface = 0;
  o2SurfaceExposed = 0;
  ethExposed = 0; // Pa, at the surface of protruded tissue
  ethProduction = 0; // mol/s per seed
  exposedArea = 0; // m², lateral area of tissue outside the seed
  exposedStamp = -1;
  lastTransport: Transport | null = null;
  axisLen0: number;
  /** O2 uptake capacity per m³ of tissue (mol m⁻³ s⁻¹), from the per-seed rate in the ledger */
  qMaxPerVolume: number;

  // per-cell fields
  readonly o2: Float64Array;
  readonly energy: Float64Array;
  readonly ros: Float64Array;
  readonly radSens: Float64Array;
  readonly gaSource: Float64Array;
  readonly gid1: Float64Array;
  readonly active: Uint8Array;
  readonly rRel: Float64Array; // radial position (fraction of slice radius / slab half-thickness)
  readonly growthRate: Float64Array; // last axial relative growth rate (1/h)
  readonly exposed: Uint8Array; // 1 = cell is outside the seed coat

  // cached indices
  tipCells: number[] = [];
  refCell = -1;
  colletCells: number[] = [];

  constructor(params: Params, env: Env, opts: SimOptions = {}) {
    this.params = params;
    this.env = env;
    this.dt = opts.dt ?? 0.05;
    this.sampleEvery = opts.sampleEvery ?? 0.5;
    this.germinationOnly = opts.germinationOnly ?? false;
    this.template = buildTemplate(params);
    const cap = this.template.cells.capacity;
    this.graph = buildGraph(this.template);
    this.layout = allocLayout(cap);
    this.pose = initialPose(this.template);
    this.shape = seedShape(p(params, "geo_seed_length_um"), p(params, "geo_seed_width_um"));
    this.h = allocHormones(cap);
    this.o2 = new Float64Array(cap);
    this.energy = new Float64Array(cap).fill(1);
    this.ros = new Float64Array(cap);
    this.radSens = new Float64Array(cap).fill(1);
    this.gaSource = new Float64Array(cap);
    this.gid1 = new Float64Array(cap);
    this.active = new Uint8Array(cap);
    this.rRel = new Float64Array(cap);
    this.growthRate = new Float64Array(cap);
    this.exposed = new Uint8Array(cap);
    this.water = p(params, "water_dry_gg");
    this.capStrength = p(params, "cap_strength0_mpa");
    this.axisLen0 = axisLength(this.template);
    {
      const c0 = this.template.cells;
      const swellFull = 1 + p(params, "imbibition_swell");
      let v = 0;
      for (let i = 0; i < c0.n; i++) if (c0.region[i] !== Region.Endosperm) v += c0.vol0[i] * swellFull * 1e-18;
      this.qMaxPerVolume = (p(params, "resp_seed_nmol_h") * 1e-9) / 3600 / v;
    }
    const P = env.p_total_kpa * PA_PER_KPA;
    this.hs = { o2: env.o2_frac * P, co2: env.co2_ppm * 1e-6 * P, eth: 0 };
    this.o2.fill(this.hs.o2); // a dry, non-respiring seed is equilibrated with the surrounding gas
    this.o2Surface = this.hs.o2;
    this.refreshCellFields();
    this.refCell = this.colletCells[0] ?? -1;
    initHormones(params, this.h, this.template.cells.n);
    this.seedling = initSeedling(this);
    if (opts.radSensitivity) this.radSens.set(opts.radSensitivity(this).subarray(0, this.template.cells.n));
    computeLayout(this.template, this.pose, this.layout);
    this.record();
  }

  /** Recompute static per-cell weights (call after cells are added). */
  refreshCellFields(): void {
    const t = this.template;
    const c = t.cells;
    const lamG = p(this.params, "ga_source_lambda");
    const lamR = p(this.params, "gid1_lambda");
    const gidBase = p(this.params, "gid1_base");
    const cotGa = p(this.params, "ga_source_cotyledon");
    this.tipCells = [];
    this.colletCells = [];
    const collet = Math.round(p(this.params, "geo_collet_index"));
    for (const sid of t.order) {
      const s = t.slices[sid];
      for (const i of s.cells) {
        const ring = s.rings[c.ringIdx[i]];
        this.rRel[i] = c.nAround[i] === 1 && ring.r0 === 0 ? 0 : (ring.r0 + ring.r1) / 2;
        const k = Math.max(1, s.qcIndex >= 1 ? s.qcIndex : 1);
        this.gaSource[i] = Math.exp(-(k - 1) / lamG);
        this.gid1[i] = gidBase + (1 - gidBase) * Math.exp(-(k - 1) / lamR);
        this.active[i] = 1;
        if (s.qcIndex >= 1 && s.qcIndex <= 2 && c.tissue[i] === Tissue.Cortex) this.tipCells.push(i);
        if (s.qcIndex === collet && c.tissue[i] === Tissue.Cortex) this.colletCells.push(i);
      }
    }
    const nw = t.cotGrid[2];
    for (let i = 0; i < c.n; i++) {
      if (c.cot[i] >= 0) {
        this.gaSource[i] = cotGa;
        this.gid1[i] = gidBase;
        this.active[i] = 1;
        this.rRel[i] = Math.abs((c.gw[i] + 0.5 - nw / 2) / (nw / 2));
      } else if (c.region[i] === Region.Endosperm) {
        this.active[i] = 0;
      }
    }
  }

  get cells() {
    return this.template.cells;
  }

  /** Relative-growth-rate temperature factor. */
  private fT(): number {
    return Math.pow(p(this.params, "q10"), (this.env.temp_c - p(this.params, "t_ref_growth_c")) / 10);
  }

  step(): void {
    const dt = this.dt;
    const params = this.params;
    const env = this.env;
    const c = this.template.cells;
    const n = c.n;
    const fT = this.fT();
    const light = lightOn(env, this.t);
    const T_K = env.temp_c + 273.15;
    const P_kPa = env.p_total_kpa;

    // ---------------- water (seed level)
    const wDry = p(params, "water_dry_gg");
    const wII = p(params, "water_phase2_gg");
    const film = waterFilm(params, env.gravity_g, env.substrate_scale_mm, env.wetted_frac_1g, env.wetted_frac_0g, env.film_um_1g, env.film_um_0g);
    const psi = env.substrate_psi_mpa;
    const wEq = wII * Math.exp(psi / p(params, "water_psi_scale_mpa"));
    const contact = Math.max(film.wetted, p(params, "water_min_contact"));
    const kImb = p(params, "water_imbibition_rate");
    if (this.water < wEq) this.water += dt * kImb * contact * (wEq - this.water);
    this.hydration = Math.max(0, Math.min(1, (this.water - wDry) / (wII - wDry)));
    // Hydrotime ↔ Lockhart: turgor ABOVE the wall-yield turgor of a reference cell scales with
    // ψ − ψb (Bradford's hydrotime model), so growth stops exactly at ψ = ψb for that cell and
    // every seed with ψb < ψ eventually grows. The mean seed on water has P = P_ref.
    const psiB = p(params, "psi_base_mpa"); // population mean (negative)
    const psiBSeed = psiB + p(params, "psi_base_seed_offset_mpa");
    const pRef = p(params, "turgor_ref_mpa");
    const pY = this.yieldTurgorRef();
    const pFull = pY + (pRef - pY) * ((psi - psiBSeed) / (0 - psiB));
    // hydration shapes only the APPROACH to the ψ-dependent plateau; the effect of ψ itself is
    // already in pFull (counting a lower plateau again would double-count water stress)
    const hRel = Math.max(0, Math.min(1, (this.water - wDry) / Math.max(wEq - wDry, 1e-9)));
    this.turgor = Math.pow(hRel, p(params, "turgor_hydration_exponent")) * Math.max(0, pFull);
    const tauAct = p(params, "activation_tau_h");
    this.activation += (dt / tauAct) * fT * (this.hydration - this.activation);
    const swell = 1 + p(params, "imbibition_swell") * this.hydration;
    this.pose.swell = swell;

    // ---------------- respiration + gas exchange
    const tr = transport(params, this.shape, T_K, P_kPa, env.airSpeed(env.gravity_g), film.wetted, film.filmUm, {
      testaRuptured: this.milestones.testaRupture !== null,
    });
    this.lastTransport = tr;
    // max uptake per tissue volume, set so a fully active, fully imbibed seed takes up resp_seed_nmol_h
    const qMax = this.qMaxPerVolume * this.activation * fT;
    const KmO2 = p(params, "resp_km_o2_pa");
    const Dt = p(params, "d_o2_water_m2s") * p(params, "tissue_diffusivity_rel");
    const Hc = p(params, "h_o2_mol_m3pa");
    const reserveFactor = this.reserve / (p(params, "reserve_k") + this.reserve);
    const vol = (i: number) => c.len[i] * c.wid[i] * c.dep[i] * swell * 1e-18;
    // which tissue has left the seed (refreshed every sample interval from the layout)
    if (this.milestones.endospermRupture !== null && this.exposedStamp !== Math.floor(this.t / this.sampleEvery)) {
      this.refreshExposure();
      this.exposedStamp = Math.floor(this.t / this.sampleEvery);
    }
    const gEnc = tr.gOut.o2;
    const gExp = tr.exposedPerArea.o2 * Math.max(this.exposedArea, 1e-15);
    // fixed-point iteration: surface pO2 ↔ total uptake (Michaelis–Menten in each cell),
    // separately for enclosed and exposed tissue
    let Q = 0;
    let pEnc = this.hs.o2;
    let pExp = this.hs.o2;
    for (let it = 0; it < 4; it++) {
      let qE = 0;
      let qX = 0;
      for (let i = 0; i < n; i++) {
        if (!this.active[i]) continue;
        const local = it === 0 ? (this.exposed[i] ? pExp : pEnc) : this.o2[i];
        const qi = qMax * reserveFactor * vol(i) * (local / (KmO2 + local));
        if (this.exposed[i]) qX += qi;
        else qE += qi;
      }
      Q = qE + qX;
      pEnc = Math.max(0, this.hs.o2 - qE / gEnc);
      pExp = qX > 0 ? Math.max(0, this.hs.o2 - qX / gExp) : this.hs.o2;
      this.o2Surface = pEnc;
      this.o2SurfaceExposed = pExp;
      // per-cell O2 from the radial profile inside the axis (cylinder) or cotyledon (slab)
      const qEnc = qMax * reserveFactor * (pEnc / (KmO2 + pEnc));
      const qExp = qMax * reserveFactor * (pExp / (KmO2 + pExp));
      for (const sid of this.template.order) {
        const s = this.template.slices[sid];
        const R = s.radius0 * Math.cbrt(swell) * 1e-6;
        for (const i of s.cells) {
          const ex = this.exposed[i];
          this.o2[i] = Math.max(0, (ex ? pExp : pEnc) - cylinderDrop(ex ? qExp : qEnc, R, this.rRel[i] * R, Dt, Hc));
        }
      }
      const half = (this.template.embryo.cotThk / 2) * Math.cbrt(swell) * 1e-6;
      for (let i = 0; i < n; i++) {
        if (c.cot[i] < 0) continue;
        const ex = this.exposed[i];
        this.o2[i] = Math.max(0, (ex ? pExp : pEnc) - slabDrop(ex ? qExp : qEnc, half, this.rRel[i] * half, Dt, Hc));
      }
    }
    this.respiration = Q;

    // ---------------- energy
    const Kaer = p(params, "aerobic_km_o2_pa");
    const yF = p(params, "fermentation_yield");
    for (let i = 0; i < n; i++) {
      if (!this.active[i]) continue;
      const fa = this.o2[i] / (Kaer + this.o2[i]);
      this.energy[i] = (fa + yF * (1 - fa)) * reserveFactor;
    }
    const molO2Reserve = p(params, "reserve_o2_capacity_mol");
    this.reserve = Math.max(0, this.reserve - (Q * dt * 3600) / molO2Reserve);
    if (this.seedling.photosynthesis > 0) this.reserve = Math.min(1.5, this.reserve + this.seedling.photosynthesis * dt);

    // ---------------- radiation
    const dr = doseRate(env, this.t); // mGy/h
    this.dose += dr * dt;
    const kDmg = p(params, "rad_damage_per_mgy");
    const kRep = p(params, "rad_repair_rate");
    for (let i = 0; i < n; i++) {
      if (!this.active[i]) continue;
      this.ros[i] += dt * (kDmg * this.radSens[i] * dr - kRep * this.ros[i]);
    }

    // ---------------- hormones (+ ethylene production → internal ethylene)
    const ethK = p(params, "eth_response_k_pa");
    const ethN = p(params, "eth_response_hill");
    const ethLevel = this.milestones.endospermRupture === null ? this.ethInt : this.ethExposed;
    const ethResp = Math.pow(ethLevel, ethN) / (Math.pow(ethK, ethN) + Math.pow(ethLevel, ethN));
    // substeps keep the explicit scheme inside its stability bound
    const du = (dt / p(params, "hormone_time_unit_h")) * this.activation * fT;
    const sub = Math.max(1, Math.ceil(du / (0.8 * maxStableDu(params, 12))));
    for (let s = 0; s < sub; s++) {
      stepHormones(params, this.graph, this.h, {
        n,
        gaSource: this.gaSource,
        gid1: this.gid1,
        o2: this.o2,
        ros: this.ros,
        active: this.active,
        hydration: this.hydration,
        activation: this.activation,
        light,
        ethResponse: ethResp,
        fT,
      }, dt / sub);
    }
    let acoEnc = 0;
    let acoExp = 0;
    for (let i = 0; i < n; i++) {
      if (!this.active[i]) continue;
      if (this.exposed[i]) acoExp += this.h.aco[i] * vol(i);
      else acoEnc += this.h.aco[i] * vol(i);
    }
    const yEth = p(params, "eth_yield_mol_m3") / 3600;
    const ethProd = yEth * (acoEnc + acoExp); // mol/s per seed
    this.ethInt = this.hs.eth + (yEth * acoEnc) / tr.gOut.eth;
    this.ethExposed = acoExp > 0 ? this.hs.eth + (yEth * acoExp) / (tr.exposedPerArea.eth * Math.max(this.exposedArea, 1e-15)) : this.hs.eth;

    // ---------------- headspace (exact integration of dp/dt = S + k_v·p_in − k·p)
    const V = env.headspace_ml * 1e-6;
    const N = env.seeds;
    const kv = env.vent_ach / 3600;
    const relax = (pNow: number, src: number, pIn: number, kLoss: number) => {
      const k = kv + kLoss;
      if (k <= 0) return pNow + src * dt * 3600;
      const pEq = (src + kv * pIn) / k;
      return pEq + (pNow - pEq) * Math.exp(-k * dt * 3600);
    };
    const coef = (R_GAS * T_K) / V; // Pa per mol
    const P = P_kPa * PA_PER_KPA;
    const rq = p(params, "resp_quotient");
    this.hs.o2 = Math.max(0, relax(this.hs.o2, -coef * N * Q, env.o2_frac * P, 0));
    this.hs.co2 = Math.max(0, relax(this.hs.co2, coef * N * rq * Q, env.co2_ppm * 1e-6 * P, 0));
    this.ethProduction = ethProd;
    this.hs.eth = Math.max(0, relax(this.hs.eth, coef * N * ethProd, env.eth_inlet_ppm * 1e-6 * P, env.eth_scrub_per_h / 3600));

    // ---------------- growth
    if (this.milestones.endospermRupture === null) this.growEnclosed(dt, ethResp, fT);
    if (this.milestones.endospermRupture !== null && !this.germinationOnly) {
      stepSeedling(this, dt, { light, ethResp, fT });
    }

    this.t += dt;
    for (const tp of PROFILE_TIMES) {
      if (this.t - dt < tp - 1e-9 && this.t >= tp - 1e-9 && !this.profiles.has(tp)) this.profiles.set(tp, this.cortexVolumeByIndex());
    }
    if (Math.floor((this.t + 1e-9) / this.sampleEvery) > Math.floor((this.t - dt + 1e-9) / this.sampleEvery)) this.record();
  }

  /** Lockhart growth of the enclosed embryo + two-stage seed-coat restraint. */
  private growEnclosed(dt: number, ethResp: number, fT: number): void {
    void ethResp;
    const params = this.params;
    const t = this.template;
    const c = t.cells;
    const phi = p(params, "wall_extensibility") * fT;
    const sigY = p(params, "wall_yield_mpa");
    const aRadTip = p(params, "radial_growth_tip");
    const aRad = p(params, "radial_growth");
    const pEff = Math.max(0, this.turgor - this.restraint);
    const swell = this.pose.swell;
    for (const sid of t.order) {
      const s = t.slices[sid];
      if (s.region === Region.Cap) continue;
      let wsum = 0;
      let gsum = 0;
      for (const i of s.cells) {
        const V = c.len[i] * c.wid[i] * c.dep[i] * swell;
        const rho = Math.cbrt((3 * V) / (4 * Math.PI));
        const sigma = (pEff * rho) / (2 * c.wallT[i]);
        const drive = phi * growthResponse(params, this.h, i) * this.energy[i] * Math.max(0, sigma - sigY);
        const w = c.wallT[i] * c.wid[i];
        wsum += w;
        gsum += w * drive;
      }
      const eps = gsum / Math.max(wsum, 1e-12);
      const ar = s.qcIndex <= 3 ? aRadTip : aRad;
      const fa = Math.exp(eps * dt);
      const fr = Math.exp(ar * eps * dt);
      for (const i of s.cells) {
        c.len[i] *= fa;
        c.wid[i] *= fr;
        c.dep[i] *= fr;
        this.growthRate[i] = eps;
      }
    }

    // restraint from the testa, then from the micropylar endosperm. Only GROWTH strain loads
    // the coverings: imbibition swells testa, endosperm and embryo together.
    const strain = axisLength(t) / this.axisLen0 - 1;
    if (this.milestones.testaRupture === null) {
      this.restraint = p(params, "testa_stiffness_mpa") * Math.max(0, strain - p(params, "testa_slack"));
      if (this.restraint >= p(params, "testa_strength_mpa")) {
        this.milestones.testaRupture = this.t + dt;
        this.pose.testaRuptured = true;
        this.strainAtTesta = strain;
        this.restraint = 0;
      }
    } else {
      // endosperm cap weakening: embryo GA signal, ethylene, held by ABA
      const gaSig = this.mean(this.h.ga, this.tipCells);
      const abaSig = this.mean(this.h.aba, this.tipCells);
      const kW = p(params, "cap_weakening_rate") * fT;
      const W =
        (gaSig / (p(params, "cap_k_ga") + gaSig)) *
        (1 + p(params, "cap_eth_boost") * ethResp) /
        (1 + abaSig / p(params, "cap_k_aba"));
      this.capStrength *= Math.exp(-kW * W * this.hydration * dt);
      this.restraint = p(params, "endosperm_stiffness_mpa") * Math.max(0, strain - this.strainAtTesta - p(params, "endosperm_slack"));
      if (this.restraint >= this.capStrength) {
        this.milestones.endospermRupture = this.t + dt;
        this.pose.endospermRuptured = true;
        this.restraint = 0;
      }
    }
  }

  /** Turgor at which a collet cortical cell (the reference cell) reaches the wall yield stress. */
  yieldTurgorRef(): number {
    if (this.refCell < 0) return 0;
    const c = this.template.cells;
    const V = c.vol0[this.refCell] * (1 + p(this.params, "imbibition_swell"));
    const rho = Math.cbrt((3 * V) / (4 * Math.PI));
    return (2 * c.wallT[this.refCell] * p(this.params, "wall_yield_mpa")) / rho;
  }

  /** Mark cells lying outside the seed ellipsoid and the lateral area of exposed axis tissue. */
  refreshExposure(): void {
    computeLayout(this.template, this.pose, this.layout);
    const c = this.template.cells;
    const a = this.template.seed.a;
    const b = this.template.seed.b;
    // test against the seed coat where it is now (it rides on the cotyledons once the root anchors)
    const [tx, ty, phi] = this.layout.shell;
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    for (let i = 0; i < c.n; i++) {
      if (c.region[i] === Region.Endosperm) {
        this.exposed[i] = 0;
        continue;
      }
      const dx = this.layout.pos[3 * i] - tx;
      const dy = this.layout.pos[3 * i + 1] - ty;
      const x = (cp * dx + sp * dy) / a;
      const y = (-sp * dx + cp * dy) / b;
      const z = this.layout.pos[3 * i + 2] / b;
      this.exposed[i] = x * x + y * y + z * z > 1 ? 1 : 0;
    }
    let area = 0;
    for (const sid of this.template.order) {
      const s = this.template.slices[sid];
      const outside = s.cells.filter((i) => this.exposed[i]).length / Math.max(s.cells.length, 1);
      if (outside > 0) area += outside * 2 * Math.PI * s.radius0 * this.meanLenOf(sid) * 1e-12;
    }
    this.exposedArea = area;
  }

  /** mean over all embryo (non-endosperm) cells — a whole-seed proxy for hormone contents */
  meanActive(arr: Float64Array): number {
    let s = 0;
    let k = 0;
    for (let i = 0; i < this.template.cells.n; i++)
      if (this.active[i]) {
        s += arr[i];
        k++;
      }
    return k ? s / k : 0;
  }

  mean(arr: Float64Array, idx: number[]): number {
    if (idx.length === 0) return 0;
    let s = 0;
    for (const i of idx) s += arr[i];
    return s / idx.length;
  }

  record(): void {
    const t = this.template;
    const c = t.cells;
    const P = this.env.p_total_kpa * PA_PER_KPA;
    let coreMin = Infinity;
    let hyp = 0;
    let nAct = 0;
    const thr = p(this.params, "hypoxia_threshold_pa");
    for (let i = 0; i < c.n; i++) {
      if (!this.active[i]) continue;
      nAct++;
      if (this.o2[i] < coreMin) coreMin = this.o2[i];
      if (this.o2[i] < thr) hyp++;
    }
    const ppb = (pa: number) => (pa / P) * 1e9;
    const lengths = this.seedling.lengths(this);
    const tr = this.lastTransport;
    this.samples.push({
      t: +this.t.toFixed(4),
      water_gg: this.water,
      hydration: this.hydration,
      turgor_mpa: this.turgor,
      restraint_mpa: this.restraint,
      cap_strength_mpa: this.capStrength,
      o2_hs_kpa: this.hs.o2 / 1000,
      o2_surface_kpa: this.o2Surface / 1000,
      o2_tip_kpa: this.mean(this.o2, this.tipCells) / 1000,
      o2_collet_kpa: this.mean(this.o2, this.colletCells) / 1000,
      o2_core_min_kpa: (Number.isFinite(coreMin) ? coreMin : 0) / 1000,
      hypoxic_frac: nAct ? hyp / nAct : 0,
      co2_int_kpa: (this.hs.co2 + (tr ? (p(this.params, "resp_quotient") * this.respiration) / tr.gOut.co2 : 0)) / 1000,
      eth_hs_ppb: ppb(this.hs.eth),
      eth_int_ppb: ppb(this.ethInt),
      eth_prod_pl_h: this.ethProduction * 3600 * 22.414e12,
      aba_tip: this.mean(this.h.aba, this.tipCells),
      aba_collet: this.mean(this.h.aba, this.colletCells),
      ga_tip: this.mean(this.h.ga, this.tipCells),
      ga_collet: this.mean(this.h.ga, this.colletCells),
      integ_tip: this.mean(this.h.integ, this.tipCells),
      integ_collet: this.mean(this.h.integ, this.colletCells),
      aba_mean: this.meanActive(this.h.aba),
      axis_len_um: axisLength(t),
      root_len_um: lengths.root,
      hyp_len_um: lengths.hypocotyl,
      reserve: this.reserve,
      dose_mgy: this.dose,
      resp_nmol_h: this.respiration * 3600 * 1e9,
      energy_tip: this.mean(this.energy, this.tipCells),
      hook_deg: this.seedling.hookDeg,
      root_angle_deg: this.seedling.rootTipAngleDeg,
      sherwood: tr ? tr.sh : 2,
    });
  }

  runTo(tEnd: number): void {
    while (this.t < tEnd - 1e-9) {
      this.step();
      if (this.germinationOnly && this.milestones.endospermRupture !== null) break;
    }
  }

  /** Cortical cell volume (µm³, excluding imbibition swelling) by QC index for the template slices. */
  cortexVolumeByIndex(): { index: number; volume: number }[] {
    const t = this.template;
    const c = t.cells;
    const out: { index: number; volume: number }[] = [];
    for (const sid of t.order) {
      const s = t.slices[sid];
      if (s.region === Region.Cap || s.qcIndex < 1 || !s.embryo) continue;
      let v = 0;
      let k = 0;
      for (const i of s.cells)
        if (c.tissue[i] === Tissue.Cortex) {
          v += c.len[i] * c.wid[i] * c.dep[i];
          k++;
        }
      out.push({ index: s.qcIndex, volume: v / Math.max(k, 1) });
    }
    return out;
  }

  updateLayout(): void {
    computeLayout(this.template, this.pose, this.layout);
  }

  /** Re-link after the seedling module adds cells. */
  rebuildGraph(): void {
    this.graph = buildGraph(this.template);
  }

  meanLenOf(sid: number): number {
    return meanLen(this.template.cells, this.template.slices[sid]);
  }
}
