// Three.js viewer for the seed twin.
//
// Adapted from arabidopsis-atlas app/src/viewer.ts (scene, OrbitControls, picking,
// ResizeObserver, dispose), extended for thousands of cells: every cell is one instance
// of a rounded box in an InstancedMesh, positioned from the model's Layout each frame.
// A clipping plane gives the cut-away through testa and endosperm. The background
// follows the CoSE theme toggle (html[data-theme]).
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Layout } from "../model/layout";
import { shellExtents } from "./seedView";

export interface ShellState {
  a: number; // testa outer semi-axes (µm)
  b: number;
  /** seed-coat frame: centre (µm) and rotation about z (rad); it rides on the cotyledons after anchoring */
  x: number;
  y: number;
  rot: number;
  testaVisible: boolean;
  testaSplit: number; // 0 intact .. 1 fully split
  mucilage: number; // µm of hydrated mucilage
}

export interface SeedView {
  layout: Layout;
  colors: Float32Array;
  shell: ShellState;
  offsetX: number;
}

export interface SeedViewer {
  update(seeds: SeedView[]): void;
  setCut(on: boolean): void;
  frame(seeds: SeedView[], immediate?: boolean): void;
  setGravityArrow(g: number): void;
  snapshot(): string;
  /** Studio: aim the camera from (elevation, azimuth) in degrees. */
  setOrbit(elevDeg: number, azimDeg: number): void;
  /** Studio: centre the view on (cx, cy) showing `span` µm across, so several viewers can share one scale. */
  setFraming(cx: number, cy: number, span: number): void;
  /** Studio: draw one frame now (used when autoRender is off). */
  render(): void;
  dispose(): void;
}

export interface ViewerOptions {
  /** run a requestAnimationFrame render loop (default true); the Studio renders on demand instead */
  autoRender?: boolean;
  /** fixed canvas size in CSS pixels; otherwise the container is tracked with a ResizeObserver */
  size?: [number, number];
  /** fixed background colour; otherwise it follows the CoSE theme toggle */
  background?: number;
  /** mouse orbit and picking (default true) */
  interactive?: boolean;
}

const GAP = 0.86; // visible cell size as a fraction of the cell box: leaves wall-like gaps

function themeIsDark(): boolean {
  const t = document.documentElement.getAttribute("data-theme");
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}

export function createSeedViewer(
  container: HTMLElement,
  capacity: number,
  onPick: (seed: number, cell: number | null) => void,
  opts: ViewerOptions = {},
): SeedViewer {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 200000);
  camera.position.set(0, 120, 1100);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  const applyTheme = () => {
    scene.background = new THREE.Color(opts.background ?? (themeIsDark() ? 0x0e1311 : 0xf3f1ea));
  };
  applyTheme();
  const themeObserver = new MutationObserver(applyTheme);
  if (opts.background === undefined) themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a30, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(400, 900, 1200);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd8ff, 0.5);
  rim.position.set(-800, -300, -600);
  scene.add(rim);

  // clipping plane: keep z <= cut (removes the near half so the inside is visible)
  const cutPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  let cutOn = true;

  // --- cells
  const geo = new RoundedBoxGeometry(1, 1, 1, 1, 0.18);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide, clippingPlanes: [cutPlane] });
  const mesh = new THREE.InstancedMesh(geo, mat, capacity * 2);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2 * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);

  // --- testa shell (two halves so it can split open) + mucilage halo
  const testaMat = new THREE.MeshStandardMaterial({
    color: 0x7a4b25,
    roughness: 0.8,
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide,
    depthWrite: false,
    clippingPlanes: [cutPlane],
  });
  const half = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  const mucGeo = new THREE.SphereGeometry(1, 48, 24);
  const mucMat = new THREE.MeshStandardMaterial({
    color: 0x9fd3ff,
    transparent: true,
    opacity: 0.12,
    roughness: 0.2,
    depthWrite: false,
    clippingPlanes: [cutPlane],
  });
  const shells = [0, 1].map(() => {
    const testaA = new THREE.Mesh(half, testaMat);
    const testaB = new THREE.Mesh(half, testaMat);
    const testa = new THREE.Group();
    testa.add(testaA, testaB);
    const mucilage = new THREE.Mesh(mucGeo, mucMat);
    scene.add(testa, mucilage);
    return { testa, testaA, testaB, mucilage };
  });

  // gravity arrow
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(-700, 300, 0), 220, 0x6b8a6b, 50, 26);
  scene.add(arrow);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = opts.autoRender !== false;
  controls.enabled = opts.interactive !== false;
  controls.target.set(0, 0, 0);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt: [number, number] | null = null;
  const onDown = (e: PointerEvent) => (downAt = [e.clientX, e.clientY]);
  const onUp = (e: PointerEvent) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(mesh, false).filter((h) => !cutOn || h.point.z <= cutPlane.constant + 1e-3);
    if (!hits.length || hits[0].instanceId === undefined) return onPick(0, null);
    const id = hits[0].instanceId;
    const seed = id >= capacity ? 1 : 0;
    onPick(seed, id - seed * capacity);
  };
  if (opts.interactive !== false) {
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
  }

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  };
  if (opts.autoRender !== false) tick();

  const resize = () => {
    const w = opts.size ? opts.size[0] : container.clientWidth || 1;
    const h = opts.size ? opts.size[1] : container.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  if (!opts.size) ro.observe(container);

  const tmpTarget = new THREE.Vector3();
  let frameDist = 1100;

  return {
    update(seeds) {
      const colorArr = mesh.instanceColor!.array as Float32Array;
      let maxIndex = 0;
      seeds.forEach((sv, k) => {
        const { layout, colors, shell, offsetX } = sv;
        const base = k * capacity;
        const n = layout.n;
        for (let i = 0; i < n; i++) {
          if (!layout.visible[i]) {
            m4.makeScale(0, 0, 0);
          } else {
            v.set(layout.pos[3 * i] + offsetX, layout.pos[3 * i + 1], layout.pos[3 * i + 2]);
            q.set(layout.quat[4 * i], layout.quat[4 * i + 1], layout.quat[4 * i + 2], layout.quat[4 * i + 3]);
            s.set(layout.scale[3 * i] * GAP, layout.scale[3 * i + 1] * GAP, layout.scale[3 * i + 2] * GAP);
            m4.compose(v, q, s);
          }
          mesh.setMatrixAt(base + i, m4);
        }
        colorArr.set(colors.subarray(0, n * 3), base * 3);
        // hide unused slots between this seed's cells and the next seed's block
        if (k === 0 && seeds.length > 1) {
          m4.makeScale(0, 0, 0);
          for (let i = n; i < capacity; i++) mesh.setMatrixAt(i, m4);
        }
        maxIndex = base + n;
        const sh = shells[k];
        sh.testa.visible = shell.testaVisible;
        sh.testa.position.set(offsetX + shell.x, shell.y, 0);
        sh.testa.rotation.z = shell.rot;
        sh.testaA.scale.set(shell.b, shell.a, shell.b);
        sh.testaB.scale.set(shell.b, shell.a, shell.b);
        sh.testaA.position.set(-shell.testaSplit * shell.a * 0.35, shell.testaSplit * shell.b * 0.25, 0);
        sh.testaA.rotation.set(0, 0, Math.PI / 2 + shell.testaSplit * 0.6);
        sh.testaB.rotation.set(0, 0, -Math.PI / 2);
        const m = Math.max(shell.mucilage, 0);
        sh.mucilage.visible = m > 1 && shell.testaVisible;
        sh.mucilage.position.set(offsetX + shell.x, shell.y, 0);
        sh.mucilage.rotation.z = shell.rot;
        sh.mucilage.scale.set(shell.a + m, shell.b + m, shell.b + m);
      });
      for (let k = seeds.length; k < 2; k++) {
        shells[k].testa.visible = false;
        shells[k].mucilage.visible = false;
      }
      mesh.count = maxIndex;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
      mesh.computeBoundingSphere();
    },
    setCut(on) {
      cutOn = on;
      const planes = on ? [cutPlane] : [];
      mat.clippingPlanes = planes;
      testaMat.clippingPlanes = planes;
      mucMat.clippingPlanes = planes;
      mat.needsUpdate = testaMat.needsUpdate = mucMat.needsUpdate = true;
    },
    frame(seeds, immediate = false) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const sv of seeds) {
        const b = sv.layout.bbox;
        if (!Number.isFinite(b[0])) continue;
        const e = shellExtents(sv.shell);
        x0 = Math.min(x0, b[0] + sv.offsetX, e[0] + sv.offsetX);
        x1 = Math.max(x1, b[3] + sv.offsetX, e[2] + sv.offsetX);
        y0 = Math.min(y0, b[1], e[1]);
        y1 = Math.max(y1, b[4], e[3]);
      }
      if (!Number.isFinite(x0)) return;
      tmpTarget.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      const span = Math.max(x1 - x0, (y1 - y0) * camera.aspect, 450) * 1.25;
      const dist = span / (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(camera.aspect, 0.6);
      if (immediate || Math.abs(dist - frameDist) / frameDist > 0.18) {
        const dir = camera.position.clone().sub(controls.target).normalize();
        controls.target.copy(tmpTarget);
        camera.position.copy(tmpTarget).addScaledVector(dir, dist);
        frameDist = dist;
        arrow.position.set(x0 - span * 0.08, (y0 + y1) / 2 + span * 0.1, 0);
        arrow.setLength(span * 0.12, span * 0.03, span * 0.015);
      }
    },
    setGravityArrow(g) {
      arrow.visible = g > 1e-3;
    },
    snapshot() {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL("image/png");
    },
    setOrbit(elevDeg, azimDeg) {
      const el = (elevDeg * Math.PI) / 180;
      const az = (azimDeg * Math.PI) / 180;
      const d = camera.position.distanceTo(controls.target) || frameDist;
      const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
      camera.position.copy(controls.target).addScaledVector(dir, d);
      camera.lookAt(controls.target);
    },
    setFraming(cx, cy, span) {
      const dir = camera.position.clone().sub(controls.target).normalize();
      const dist = span / (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(camera.aspect, 0.6);
      controls.target.set(cx, cy, 0);
      camera.position.copy(controls.target).addScaledVector(dir, dist);
      camera.lookAt(controls.target);
      frameDist = dist;
      // gravity arrow at the right edge, clear of the panel's labels (top-left) and readouts (top-right)
      arrow.position.set(cx + span * 0.43, cy + span * 0.02, 0);
      arrow.setLength(span * 0.1, span * 0.025, span * 0.012);
    },
    render() {
      renderer.render(scene, camera);
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      geo.dispose();
      mat.dispose();
      testaMat.dispose();
      mucMat.dispose();
      half.dispose();
      mucGeo.dispose();
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss(); // free the WebGL context now (browsers cap live contexts)
      renderer.domElement.remove();
    },
  };
}
