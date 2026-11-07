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

export interface ShellState {
  a: number; // testa outer semi-axes (µm)
  b: number;
  testaVisible: boolean;
  testaSplit: number; // 0 intact .. 1 fully split
  mucilage: number; // µm of hydrated mucilage
}

export interface SeedViewer {
  update(layout: Layout, colors: Float32Array, shell: ShellState): void;
  setCut(on: boolean): void;
  frame(layout: Layout, immediate?: boolean): void;
  setGravityArrow(g: number): void;
  snapshot(): string;
  dispose(): void;
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
  onPick: (cell: number | null) => void,
): SeedViewer {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 200000);
  camera.position.set(0, 120, 1100);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  const applyTheme = () => {
    scene.background = new THREE.Color(themeIsDark() ? 0x0e1311 : 0xf3f1ea);
  };
  applyTheme();
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

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
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
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
  const testaA = new THREE.Mesh(half, testaMat);
  const testaB = new THREE.Mesh(half, testaMat);
  testaA.rotation.z = Math.PI / 2; // dome opens toward −x (micropylar end)
  testaB.rotation.z = -Math.PI / 2;
  const testa = new THREE.Group();
  testa.add(testaA, testaB);
  scene.add(testa);
  const mucMat = new THREE.MeshStandardMaterial({
    color: 0x9fd3ff,
    transparent: true,
    opacity: 0.12,
    roughness: 0.2,
    depthWrite: false,
    clippingPlanes: [cutPlane],
  });
  const mucilage = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mucMat);
  scene.add(mucilage);

  // gravity arrow
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(-700, 300, 0), 220, 0x6b8a6b, 50, 26);
  scene.add(arrow);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  let lastCount = 0;

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
    onPick(hits.length && hits[0].instanceId !== undefined ? hits[0].instanceId : null);
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  };
  tick();

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  const tmpTarget = new THREE.Vector3();
  let frameDist = 1100;

  return {
    update(layout, colors, shell) {
      const n = layout.n;
      for (let i = 0; i < n; i++) {
        if (!layout.visible[i]) {
          m4.makeScale(0, 0, 0);
        } else {
          v.set(layout.pos[3 * i], layout.pos[3 * i + 1], layout.pos[3 * i + 2]);
          q.set(layout.quat[4 * i], layout.quat[4 * i + 1], layout.quat[4 * i + 2], layout.quat[4 * i + 3]);
          s.set(layout.scale[3 * i] * GAP, layout.scale[3 * i + 1] * GAP, layout.scale[3 * i + 2] * GAP);
          m4.compose(v, q, s);
        }
        mesh.setMatrixAt(i, m4);
      }
      (mesh.instanceColor!.array as Float32Array).set(colors.subarray(0, n * 3));
      mesh.count = n;
      if (n !== lastCount) lastCount = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
      mesh.computeBoundingSphere();

      testa.visible = shell.testaVisible;
      testa.scale.set(1, 1, 1);
      testaA.scale.set(shell.b, shell.a, shell.b);
      testaB.scale.set(shell.b, shell.a, shell.b);
      // split: the micropylar half swings away
      testaA.position.set(-shell.testaSplit * shell.a * 0.35, shell.testaSplit * shell.b * 0.25, 0);
      testaA.rotation.set(0, 0, Math.PI / 2 + shell.testaSplit * 0.6);
      testaB.position.set(0, 0, 0);
      const m = Math.max(shell.mucilage, 0);
      mucilage.visible = m > 1;
      mucilage.scale.set(shell.a + m, shell.b + m, shell.b + m);
    },
    setCut(on) {
      cutOn = on;
      const planes = on ? [cutPlane] : [];
      mat.clippingPlanes = planes;
      testaMat.clippingPlanes = planes;
      mucMat.clippingPlanes = planes;
      mat.needsUpdate = testaMat.needsUpdate = mucMat.needsUpdate = true;
    },
    frame(layout, immediate = false) {
      const [x0, y0, , x1, y1] = layout.bbox;
      if (!Number.isFinite(x0)) return;
      tmpTarget.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      const span = Math.max(x1 - x0, y1 - y0, 450) * 1.35;
      const dist = span / (2 * Math.tan((camera.fov * Math.PI) / 360));
      // only move the camera when the scene has grown or shrunk meaningfully
      if (immediate || Math.abs(dist - frameDist) / frameDist > 0.18) {
        const dir = camera.position.clone().sub(controls.target).normalize();
        controls.target.copy(tmpTarget);
        camera.position.copy(tmpTarget).addScaledVector(dir, dist);
        frameDist = dist;
        arrow.position.set(x0 - span * 0.15, (y0 + y1) / 2 + span * 0.1, 0);
        arrow.setLength(span * 0.16, span * 0.04, span * 0.02);
      }
    },
    setGravityArrow(g) {
      arrow.visible = g > 1e-3;
    },
    snapshot() {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL("image/png");
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
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
