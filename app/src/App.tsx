import { useEffect, useRef } from "react";
import { defaultParams } from "./model/params";
import { buildTemplate } from "./model/geometry";
import { allocLayout, computeLayout, initialPose } from "./model/layout";
import { createSeedViewer } from "./view/viewer";
import { TISSUE_COLORS } from "./view/colors";

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const params = defaultParams();
    const t = buildTemplate(params);
    const L = allocLayout(t.cells.capacity);
    computeLayout(t, initialPose(t), L);
    const colors = new Float32Array(t.cells.capacity * 3);
    for (let i = 0; i < t.cells.n; i++) colors.set(TISSUE_COLORS[t.cells.tissue[i]], 3 * i);
    const v = createSeedViewer(host.current!, t.cells.capacity, () => {});
    v.update(L, colors, { a: t.seed.a, b: t.seed.b, testaVisible: true, testaSplit: 0, mucilage: 0 });
    v.frame(L, true);
    (window as unknown as { __seed: unknown }).__seed = { n: t.cells.n, bbox: L.bbox, slices: t.order.length };
    return () => v.dispose();
  }, []);
  return (
    <div className="app">
      <header className="app-header"><h1>Deep Space Seed Twin</h1></header>
      <div className="viewer" ref={host} />
    </div>
  );
}
