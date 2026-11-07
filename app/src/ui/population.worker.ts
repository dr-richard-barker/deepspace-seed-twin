// Runs a seed population off the main thread so the 3D view stays responsive.
import { runPopulation } from "../model/population";
import { envFor, paramsFor, type RunConfig } from "./driver";

self.onmessage = (ev: MessageEvent<{ cfg: RunConfig; n: number }>) => {
  const { cfg, n } = ev.data;
  const res = runPopulation(paramsFor(cfg), envFor(cfg), n, 20261106, 96, (i, t) => {
    (self as unknown as Worker).postMessage({ type: "progress", i, t });
  });
  (self as unknown as Worker).postMessage({ type: "done", res });
};
