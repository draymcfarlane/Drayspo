import { useEffect, useRef } from "react";
import { useAppReady } from "@/lib/app-ready";
import { useConfig } from "@/config/ConfigProvider";

// Fragment shader that blends drifting color blobs into the page backdrop.
const frag = /* glsl */ `
precision mediump float;
uniform float uTime; uniform vec2 uRes; uniform vec2 uMouse; uniform float uCount; uniform float uCursor;
uniform vec3 uP; uniform vec3 uS; uniform vec3 uA; uniform vec3 uBg;
varying vec2 vUv;
void main(){
  vec2 uv = vUv; float asp = uRes.x / uRes.y; vec2 p = vec2(uv.x * asp, uv.y);
  float field = 0.0; vec3 col = vec3(0.0); float wsum = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uCount) break;
    float fi = float(i);
    vec2 c = vec2(0.5*asp + sin(uTime*(0.3+fi*0.07)+fi*1.7)*0.38*asp, 0.5 + cos(uTime*(0.25+fi*0.05)+fi*2.3)*0.33);
    float r = 0.22 + 0.06*sin(uTime*0.5+fi);
    float d = r*r / (dot(p-c,p-c)+0.0001);
    field += d;
    vec3 bc = mod(fi,3.0) < 1.0 ? uP : (mod(fi,3.0) < 2.0 ? uS : uA);
    col += bc*d; wsum += d;
  }
  vec2 m = vec2(uMouse.x*asp, uMouse.y);
  float md = 0.04 / (dot(p-m,p-m)+0.0001) * uCursor;
  field += md; col += uA*md; wsum += md;
  col /= max(wsum, 0.0001);
  float edge = smoothstep(0.9, 1.6, field);
  vec3 outc = mix(uBg, col, edge*0.55);
  // grain removed for perf
  // outc += (fract(sin(dot(uv*uRes, vec2(12.9898,78.233)))*43758.5453)-0.5)*0.02;
  gl_FragColor = vec4(outc, 1.0);
}`;
// Pass-through vertex shader for the full-screen triangle.
const vert = `attribute vec2 position; attribute vec2 uv; varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position,0.0,1.0);}`;

// Converts a hex color to normalized RGB for shader uniforms.
const hexToRgb = (h: string): [number, number, number] => {
  let s = h.slice(1);
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const n = parseInt(s, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// Frame-capped WebGL background driven by the active theme palette.
export function LiquidBackground() {
  const { config, intensity } = useConfig();
  const ready = useAppReady();
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({ config, intensity, ready });
  live.current = { config, intensity, ready };

  useEffect(() => {
    let raf = 0;
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const { Renderer, Program, Mesh, Triangle } = await import("ogl");
      if (disposed || !host.current) return;
      const mobile = window.matchMedia("(max-width: 768px)").matches;
      const renderer = new Renderer({ dpr: mobile ? 0.35 : 0.5, alpha: false });
      const gl = renderer.gl;
      gl.canvas.setAttribute("aria-hidden", "true");
      gl.canvas.className = "h-full w-full";
      host.current.appendChild(gl.canvas);
      const c = live.current.config.theme.colors;
      const cur = { p: hexToRgb(c.primary), s: hexToRgb(c.secondary), a: hexToRgb(c.accent), bg: hexToRgb(c.background) };
      const program = new Program(gl, {
        vertex: vert, fragment: frag,
        uniforms: { uTime: { value: 0 }, uRes: { value: [1, 1] }, uMouse: { value: [0.5, 0.5] }, uCount: { value: 4 }, uCursor: { value: 0 }, uP: { value: cur.p }, uS: { value: cur.s }, uA: { value: cur.a }, uBg: { value: cur.bg } },
      });
      const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
      const resize = () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        program.uniforms['uRes']!.value = [window.innerWidth, window.innerHeight];
      };
      resize();
      window.addEventListener("resize", resize);
      const mouse = [0.5, 0.5];
      const target = [0.5, 0.5];
      const onMove = (e: PointerEvent) => { target[0] = e.clientX / window.innerWidth; target[1] = 1 - e.clientY / window.innerHeight; };
      window.addEventListener("pointermove", onMove);
      let t = 0; let last = performance.now();
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        if (now - last < 1000 / 45) return; // cap ~45fps: blobs move slowly, saves GPU
        const dt = Math.min((now - last) / 1000, 0.05); last = now;
        const { config: cfg, intensity: k } = live.current;
        const col = cfg.theme.colors;
        const ease = 1 - Math.exp(-3 * dt);
        const targets = { p: col.primary, s: col.secondary, a: col.accent, bg: col.background };
        (["p", "s", "a", "bg"] as const).forEach((key) => {
          const tgt = hexToRgb(targets[key]);
          const v = cur[key];
          for (let j = 0; j < 3; j++) v[j] = v[j]! + (tgt[j]! - v[j]!) * ease;
        });
        t += dt * cfg.animation.blobSpeed * k * (live.current.ready ? 1 : 0);
        mouse[0] = mouse[0]! + (target[0]! - mouse[0]!) * ease * 2; mouse[1] = mouse[1]! + (target[1]! - mouse[1]!) * ease * 2;
        const u = program.uniforms as Record<string, { value: unknown }>;
        u['uTime']!.value = t + 10; u['uMouse']!.value = mouse;
        u['uCount']!.value = mobile ? Math.min(cfg.animation.blobCount, 3) : cfg.animation.blobCount;
        u['uCursor']!.value = cfg.animation.enableCursorEffects ? k : 0;
        u['uP']!.value = cur.p; u['uS']!.value = cur.s; u['uA']!.value = cur.a; u['uBg']!.value = cur.bg;
        renderer.render({ scene: mesh });
      };
      const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } };
      document.addEventListener("visibilitychange", onVis);
      raf = requestAnimationFrame(loop);
      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
        window.removeEventListener("pointermove", onMove);
        document.removeEventListener("visibilitychange", onVis);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        gl.canvas.remove();
      };
    })();
    return () => { disposed = true; cleanup(); };
  }, []);

  return <div ref={host} className="liquid-bg" />;
}
