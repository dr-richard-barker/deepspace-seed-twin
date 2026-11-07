// Parameter access for the seed twin.
//
// Every number the model uses lives in data/params/parameter_ledger.csv and reaches the
// code only through params.generated.json (built by scripts/build_ledger.py). `p()` throws
// on an unknown id so a typo can never silently become `undefined → NaN`.
import generated from "./params.generated.json";

export type Tier = "measured" | "standard" | "derived" | "fitted" | "assumed";

export interface ParamEntry {
  id: string;
  value: number;
  unit: string;
  tier: Tier;
  group: string;
  description: string;
  source: string;
  note: string;
}

export interface Reference {
  key: string;
  authors: string;
  year: string;
  title: string;
  journal: string;
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  verified_on: string;
  verified_via: string;
}

export const LEDGER: ReadonlyArray<ParamEntry> = (generated as { params: ParamEntry[] }).params;
export const REFERENCES: ReadonlyArray<Reference> = (generated as { references: Reference[] }).references;
export const LEDGER_BY_ID: ReadonlyMap<string, ParamEntry> = new Map(LEDGER.map((e) => [e.id, e]));

/** A mutable parameter set: ledger defaults plus any user overrides. */
export type Params = Record<string, number>;

export function defaultParams(): Params {
  const out: Params = {};
  for (const e of LEDGER) out[e.id] = e.value;
  return out;
}

/** Read one parameter; throws if the id is not in the ledger. */
export function p(params: Params, id: string): number {
  const v = params[id];
  if (v === undefined) throw new Error(`unknown parameter "${id}" (not in parameter_ledger.csv)`);
  return v;
}

/** Ids the model actually read during a run — used by the gates to catch dead ledger rows. */
export const USED = new Set<string>();
export function pTracked(params: Params, id: string): number {
  USED.add(id);
  return p(params, id);
}
