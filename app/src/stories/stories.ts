// Stories gallery: one card per rendered video, read from videos/manifest.json (written by
// scripts/render_videos.js). Videos autoplay muted while on screen and pause when scrolled
// away (pattern from Hardware_OSDR_review/site/site.js); reduced-motion users get controls only.
import "./stories.css";

interface Entry {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  duration_s: number;
  bytes: number;
  reproduce: string;
}

const list = document.getElementById("list")!;
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string | null, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

function card(e: Entry): HTMLElement {
  const art = document.createElement("article");
  art.className = "story";
  art.id = e.id;
  const v = el("video", null, art);
  v.src = `videos/${e.id}.mp4`;
  v.poster = `videos/${e.id}.jpg`;
  v.controls = true;
  v.muted = true;
  v.playsInline = true;
  v.preload = "none";
  v.setAttribute("aria-label", `${e.title}: ${e.subtitle}`);
  const tr = el("track", null, v);
  tr.kind = "captions";
  tr.srclang = "en";
  tr.label = "English";
  tr.src = `videos/${e.id}.vtt`;
  const body = el("div", "body", art);
  el("h2", null, body, e.title);
  el("p", "sub", body, e.subtitle);
  el("p", null, body, e.description);
  const meta = el("p", "meta", body);
  meta.textContent = `${Math.floor(e.duration_s / 60)}:${String(Math.round(e.duration_s % 60)).padStart(2, "0")} · ${(e.bytes / 1e6).toFixed(1)} MB`;
  const links = el("p", "links", body);
  const live = el("a", null, links, "Play it live in the studio");
  live.href = `studio.html?story=${e.id}`;
  const open = el("a", null, links, "Open the scenario in the twin");
  open.href = e.reproduce;
  const dl = el("a", null, links, "Download MP4");
  dl.href = `videos/${e.id}.mp4`;
  dl.setAttribute("download", "");
  return art;
}

async function main() {
  let entries: Entry[];
  try {
    const r = await fetch("videos/manifest.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(String(r.status));
    entries = await r.json();
  } catch {
    list.innerHTML = "";
    el("p", "muted", list, "No videos have been rendered yet.");
    return;
  }
  list.innerHTML = "";
  for (const e of entries) list.appendChild(card(e));
  if (reduceMotion || !("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver(
    (items) => {
      for (const it of items) {
        const v = it.target as HTMLVideoElement;
        if (it.isIntersecting && it.intersectionRatio > 0.6) {
          v.preload = "auto";
          v.play().catch(() => undefined);
        } else if (!v.paused) v.pause();
      }
    },
    { threshold: [0, 0.6] },
  );
  list.querySelectorAll("video").forEach((v) => io.observe(v));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) list.querySelectorAll("video").forEach((v) => v.pause());
  });
}

main();
