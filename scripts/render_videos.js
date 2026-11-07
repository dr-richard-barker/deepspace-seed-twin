// Render the Stories videos: headless Chrome drives app/studio.html frame by frame over the
// DevTools protocol, and every 1920×1080 screenshot is piped into ffmpeg (H.264, yuv420p).
//
// usage:  npm run videos                  (all stories in stories/*.json)
//         npm run videos -- gravity       (named stories)
//         node scripts/render_videos.js gravity --frames 90 --out /tmp/x   (quick test, no publish)
//         GL=swiftshader node scripts/render_videos.js ...                 (software GL)
//
// Adapted from "ASGSR presentation 2026 refined/build/record_explorer.mjs" (Node 22 built-in
// WebSocket + CDP, no puppeteer/playwright). ffmpeg on this machine has no drawtext/subtitles,
// so every caption is HTML on the Studio stage and is captured in the screenshot.
//
// Outputs per story (default --out app/public/videos):
//   <id>.mp4   <id>.jpg (poster)   <id>.vtt (captions)   manifest.json (gallery index)
//   results/videos/<id>_numbers.csv   every number shown on screen and the template behind it
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DIST = join(ROOT, "dist");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const PORT = 8497;
const CDP_PORT = 9341;

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const maxFrames = Number(opt("--frames", "0")) || 0;
const outDir = resolve(opt("--out", join(ROOT, "app/public/videos")));
const startFrame = Number(opt("--start", "0")) || 0;
/** --stills 0,450,900 (or seconds with an "s" suffix: 3s,40s): save PNG stills only, no video */
const stills = opt("--stills", "");
const publish = outDir === join(ROOT, "app/public/videos");
const ids = args.length
  ? args
  : readdirSync(join(ROOT, "stories"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(ROOT, "stories", f), "utf8")).id);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".vtt": "text/vtt", ".wasm": "application/wasm" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = join(DIST, path);
    if (!file.startsWith(DIST)) return res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((r) => server.listen(PORT, "127.0.0.1", () => r(server)));
}

async function cdp() {
  const profile = join(ROOT, ".chrome-render-profile");
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      "--window-size=1920,1080",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      ...(process.env.GL === "swiftshader" ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=metal", "--enable-gpu-rasterization"]),
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let page;
  for (let i = 0; i < 60 && !page; i++) {
    await sleep(200);
    try {
      page = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json()).find((t) => t.type === "page");
    } catch {}
  }
  if (!page) throw new Error("Chrome did not expose a page target");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  const consoleErrors = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === "Runtime.exceptionThrown") consoleErrors.push(msg.params.exceptionDetails?.exception?.description ?? "exception");
    else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const close = async () => {
    try {
      ws.close();
    } catch {}
    chrome.kill("SIGTERM");
    await sleep(400);
    rmSync(profile, { recursive: true, force: true });
  };
  return { send, evaluate, close, consoleErrors };
}

function encoder(file, fps) {
  const ff = spawn(
    FFMPEG,
    ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", file],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const done = new Promise((res, rej) => ff.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`)))));
  const write = (buf) => new Promise((res) => (ff.stdin.write(buf) ? res() : ff.stdin.once("drain", res)));
  return { write, end: async () => (ff.stdin.end(), done) };
}

/**
 * Screenshot the stage. A blank frame (a uniform page compresses to a few kB) means the compositor
 * had not presented yet: wait and retry rather than encode a white flash.
 */
async function capture(b) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const shot = await b.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 }, captureBeyondViewport: false });
    const buf = Buffer.from(shot.data, "base64");
    if (buf.length > 15000) return buf; // a uniform 1920×1080 PNG is ~6 kB; the sparsest real frame (a title card) is ~50 kB
    await sleep(150);
    await b.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))");
  }
  throw new Error("stage screenshot stayed blank after 6 attempts");
}

function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  if (!existsSync(join(DIST, "studio.html"))) throw new Error("dist/studio.html missing: run `npm run build` first");
  mkdirSync(outDir, { recursive: true });
  const server = await serve();
  const b = await cdp();
  try {
    await b.send("Page.enable");
    await b.send("Runtime.enable");
    await b.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await b.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/studio.html?render=1` });
    for (let i = 0; i < 150; i++) {
      await sleep(200);
      if (await b.evaluate("!!(window.__studio && window.__studio.ready)").catch(() => false)) break;
      if (i === 149) throw new Error(`studio did not initialise: ${b.consoleErrors.join(" | ")}`);
    }
    await b.evaluate("document.fonts.ready.then(() => true)");
    const manifestFile = join(outDir, "manifest.json");
    const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : [];
    for (const id of ids) {
      const story = JSON.parse(readFileSync(join(ROOT, "stories", `${id}.json`), "utf8"));
      const info = await b.evaluate(`__studio.load(${JSON.stringify(id)})`);
      if (stills) {
        const frames = stills.split(",").map((s) => (s.endsWith("s") ? Math.round(parseFloat(s) * info.fps) : Number(s)));
        for (const f of frames.sort((a, c) => a - c)) {
          await b.evaluate(`__studio.renderFrame(${f})`);
          writeFileSync(join(outDir, `${id}_f${String(f).padStart(5, "0")}.png`), await capture(b));
        }
        console.log(`${id}: ${frames.length} still(s) of ${info.frames} frames (${info.durationS.toFixed(1)} s) -> ${outDir}`);
        if (b.consoleErrors.length) throw new Error(`page errors: ${b.consoleErrors.join(" | ")}`);
        continue;
      }
      const last = maxFrames ? Math.min(info.frames, startFrame + maxFrames) : info.frames;
      const mp4 = join(outDir, `${id}.mp4`);
      const enc = encoder(mp4, info.fps);
      const posterFrame = Math.min(last - 1, Math.max(startFrame, Math.round(story.poster_s !== undefined ? story.poster_s * info.fps : (startFrame + last) * 0.5)));
      const t0 = Date.now();
      for (let f = startFrame; f < last; f++) {
        await b.evaluate(`__studio.renderFrame(${f})`);
        const shot = await capture(b);
        await enc.write(shot);
        if (f === posterFrame) {
          const jpg = await b.send("Page.captureScreenshot", { format: "jpeg", quality: 82, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 } });
          writeFileSync(join(outDir, `${id}.jpg`), Buffer.from(jpg.data, "base64"));
        }
        if ((f - startFrame) % 150 === 0) {
          const done = f - startFrame + 1;
          const rate = done / ((Date.now() - t0) / 1000);
          process.stdout.write(`  ${id}: frame ${f + 1}/${last}  (${rate.toFixed(1)} fps, ~${((last - f) / rate / 60).toFixed(1)} min left)\n`);
        }
        if (b.consoleErrors.length) throw new Error(`page errors at frame ${f}: ${b.consoleErrors.join(" | ")}`);
      }
      await enc.end();
      writeFileSync(join(outDir, `${id}.vtt`), await b.evaluate("__studio.vtt()"));
      const nums = await b.evaluate("__studio.numbers()");
      const numbersDir = publish ? join(ROOT, "results/videos") : outDir;
      mkdirSync(numbersDir, { recursive: true });
      writeFileSync(
        join(numbersDir, `${id}_numbers.csv`),
        ["scene,where,ref,value,display", ...nums.map((n) => [n.scene, n.where, n.ref, n.value === null ? "" : n.value, n.display].map(csvCell).join(","))].join("\n") + "\n",
      );
      const bytes = statSync(mp4).size;
      const entry = {
        id,
        title: story.title,
        subtitle: story.subtitle,
        description: story.description,
        duration_s: +((last - startFrame) / info.fps).toFixed(1),
        bytes,
        reproduce: await b.evaluate("__studio.reproduceUrl()"),
      };
      const k = manifest.findIndex((m) => m.id === id);
      if (k >= 0) manifest[k] = entry;
      else manifest.push(entry);
      const order = ["intro", "gravity", "hardware", "light_air", "radiation_fields"];
      manifest.sort((a, c) => (order.indexOf(a.id) + 99) % 99 - (order.indexOf(c.id) + 99) % 99);
      writeFileSync(manifestFile, JSON.stringify(manifest, null, 1) + "\n");
      console.log(`${id}: ${last - startFrame} frames, ${(bytes / 1e6).toFixed(1)} MB -> ${mp4} (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
    }
  } finally {
    await b.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
