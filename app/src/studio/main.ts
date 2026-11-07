// Studio entry. `?story=id` picks the storyboard; `&render=1` is the recorder's mode (bare
// 1920×1080 stage, no controls, frames rendered only when __studio.renderFrame is called).
import "./studio.css";
import { Studio, W, H } from "./studio";

declare global {
  interface Window {
    __studio?: {
      ready: boolean;
      stories: () => string[];
      load: (id: string) => { id: string; frames: number; fps: number; durationS: number; scenes: number };
      renderFrame: (i: number) => Promise<void>;
      numbers: () => unknown[];
      vtt: () => string;
      reproduceUrl: () => string;
    };
  }
}

const params = new URLSearchParams(location.search);
const renderMode = params.get("render") === "1";
document.body.classList.toggle("render", renderMode);

const viewport = document.getElementById("viewport")!;
const studio = new Studio(viewport);
const storyId = params.get("story") ?? studio.stories()[0];

window.__studio = {
  ready: false,
  stories: () => studio.stories(),
  load: (id) => studio.load(id),
  // wait two animation frames so the compositor has presented the new canvases and DOM before
  // the recorder screenshots (a scene change creates new WebGL contexts)
  renderFrame: async (i) => {
    studio.renderFrame(i);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  },
  numbers: () => studio.numbers(),
  vtt: () => studio.vtt(),
  reproduceUrl: () => studio.reproduceUrl(),
};

if (renderMode) {
  window.__studio.ready = true;
} else {
  // live playback: scale the stage to the window, play / pause / scrub
  const info = studio.load(storyId);
  const bar = document.getElementById("controls")!;
  const select = bar.querySelector("select")!;
  const play = bar.querySelector<HTMLButtonElement>("button.play")!;
  const scrub = bar.querySelector<HTMLInputElement>("input[type=range]")!;
  const time = bar.querySelector<HTMLElement>(".time")!;
  const open = bar.querySelector<HTMLAnchorElement>("a.open")!;
  for (const id of studio.stories()) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = id.replace(/_/g, " ");
    o.selected = id === storyId;
    select.appendChild(o);
  }
  select.onchange = () => {
    location.search = `?story=${select.value}`;
  };
  let frames = info.frames;
  let fps = info.fps;
  scrub.max = String(frames - 1);
  open.href = studio.reproduceUrl();
  let frame = 0;
  let playing = false;
  let t0 = 0;
  let f0 = 0;
  const fit = () => {
    const k = Math.min(window.innerWidth / W, (window.innerHeight - 64) / H);
    viewport.style.transform = `scale(${k})`;
    viewport.parentElement!.style.height = `${H * k}px`;
    viewport.parentElement!.style.width = `${W * k}px`;
  };
  fit();
  window.addEventListener("resize", fit);
  const show = (f: number) => {
    frame = Math.max(0, Math.min(frames - 1, f));
    studio.renderFrame(frame);
    scrub.value = String(frame);
    time.textContent = `${(frame / fps).toFixed(1)} / ${(frames / fps).toFixed(0)} s`;
  };
  const loop = (now: number) => {
    if (!playing) return;
    const target = f0 + Math.floor(((now - t0) / 1000) * fps);
    if (target >= frames - 1) {
      show(frames - 1);
      playing = false;
      play.textContent = "Play";
      return;
    }
    if (target !== frame) show(target);
    requestAnimationFrame(loop);
  };
  play.onclick = () => {
    playing = !playing;
    play.textContent = playing ? "Pause" : "Play";
    if (playing) {
      if (frame >= frames - 1) frame = 0;
      t0 = performance.now();
      f0 = frame;
      requestAnimationFrame(loop);
    }
  };
  scrub.oninput = () => {
    playing = false;
    play.textContent = "Play";
    show(Number(scrub.value));
  };
  // first frame after the page has painted once
  requestAnimationFrame(() => {
    show(0);
    window.__studio!.ready = true;
    frames = info.frames;
    fps = info.fps;
  });
}
