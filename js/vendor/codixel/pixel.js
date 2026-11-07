// MIT Codixel runtime subset; upstream core/pixel.js. See LICENSE and VFX.md.
"use strict";

const P = {};

P.clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
P.lerp = (a, b, u) => a + (b - a) * u;
P.ease = {
  io: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  out: (u) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u)),
  in: (u) => (u <= 0 ? 0 : Math.pow(2, 10 * u - 10)),
  sine: (u) => 0.5 - 0.5 * Math.cos(Math.PI * u),
  quad: (u) => 1 - (1 - u) * (1 - u),
};

P.rgb = (r, g, b) => ((0xff000000 | (b << 16) | (g << 8) | r) >>> 0);
P.col = (c) => (typeof c === "number" ? c : P.rgb(c[0] | 0, c[1] | 0, c[2] | 0));
P.mix = (a, b, u) => {
  u = P.clamp(u);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
};
P.ramp = (cols, u) => {
  u = P.clamp(u) * (cols.length - 1);
  const i = Math.min(cols.length - 2, Math.floor(u));
  return P.mix(cols[i], cols[i + 1], u - i);
};
P.palette = (cols, n) => Array.from({ length: n }, (_, i) => P.col(P.ramp(cols, i / (n - 1))));

P.BT = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16));
P.bt = (x, y) => P.BT[((y & 3) << 2) | (x & 3)];
P.ditherIndex = (v, n, x, y, width = 0.35) => {
  v = P.clamp(v, 0, 0.9999) * (n - 1);
  let k = Math.floor(v);
  const f = v - k;
  if ((f - (1 - width)) / width > P.bt(x, y)) k++;
  return Math.min(n - 1, k);
};

P.rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

P.hash = (a, b, s = 0) => {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
P.noise = (x, y, s = 0) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = P.hash(ix, iy, s), b = P.hash(ix + 1, iy, s), c = P.hash(ix, iy + 1, s), d = P.hash(ix + 1, iy + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};
P.fbm = (x, y, oct = 4, s = 0) => {
  let v = 0, amp = 0.5, f = 1, sum = 0;
  for (let i = 0; i < oct; i++) {
    v += P.noise(x * f, y * f, s + i * 17) * amp;
    sum += amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / sum;
};

class Buf {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint32Array(w * h);
    this.ox = 0;
    this.oy = 0;
  }

  clear(c = 0) {
    this.px.fill(c ? P.col(c) : 0);
  }

  put(i, c) {
    this.px[i] = c;
  }

  get(x, y) {
    x = Math.round(x) - this.ox;
    y = Math.round(y) - this.oy;
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.px[y * this.w + x];
  }

  pset(x, y, c) {
    x = Math.round(x) - this.ox;
    y = Math.round(y) - this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.put(y * this.w + x, P.col(c));
  }

  rect(x0, y0, x1, y1, c) {
    c = P.col(c);
    const a = Math.max(Math.round(x0) - this.ox, 0), b = Math.min(Math.round(x1) - this.ox, this.w);
    const p = Math.max(Math.round(y0) - this.oy, 0), q = Math.min(Math.round(y1) - this.oy, this.h);
    for (let y = p; y < q; y++) for (let x = a; x < b; x++) this.put(y * this.w + x, c);
  }

  blob(cx, cy, r, color, dens = 1, edge = 0, sy = 1) {
    if (r <= 0 || dens <= 0) return;
    const c = P.col(color), R = r * (1 + edge);
    const x0 = Math.max(Math.floor(cx - R) - 1, this.ox), x1 = Math.min(Math.ceil(cx + R) + 1, this.ox + this.w - 1);
    const y0 = Math.max(Math.floor(cy - R * sy) - 1, this.oy), y1 = Math.min(Math.ceil(cy + R * sy) + 1, this.oy + this.h - 1);
    const span = R - r + 1e-6, lim = R * R;
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - cy) / sy, dy2 = dy * dy;
      if (dy2 > lim) continue;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, q = dx * dx + dy2;
        if (q > lim) continue;
        const d = Math.sqrt(q);
        const den = edge > 0 ? dens * P.clamp((R - d) / span) : d <= r ? dens : 0;
        if (P.bt(x, y) < den) this.put((y - this.oy) * this.w + x - this.ox, c);
      }
    }
  }

  ring(cx, cy, r, width, color, dens = 1, sy = 1) {
    if (dens <= 0) return;
    const c = P.col(color), R = r + width;
    const x0 = Math.max(Math.floor(cx - R) - 1, this.ox), x1 = Math.min(Math.ceil(cx + R) + 1, this.ox + this.w - 1);
    const y0 = Math.max(Math.floor(cy - R * sy) - 1, this.oy), y1 = Math.min(Math.ceil(cy + R * sy) + 1, this.oy + this.h - 1);
    for (let y = y0; y <= y1; y++) {
      const dy = (y + 0.5 - cy) / sy;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, d = Math.sqrt(dx * dx + dy * dy);
        if (d >= r && d <= R && P.bt(x, y) < dens) this.put((y - this.oy) * this.w + x - this.ox, c);
      }
    }
  }

  line(x0, y0, x1, y1, color, width = 1) {
    const c = P.col(color), n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))), h = (width - 1) / 2;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      if (width <= 1) this.pset(x, y, c);
      else this.rect(x - h, y - h, x + h + 1, y + h + 1, c);
    }
  }

  poly(pts, color) {
    const c = P.col(color);
    let y0 = Infinity, y1 = -Infinity;
    for (const p of pts) {
      y0 = Math.min(y0, p[1]);
      y1 = Math.max(y1, p[1]);
    }
    y0 = Math.max(Math.floor(y0), this.oy);
    y1 = Math.min(Math.ceil(y1), this.oy + this.h - 1);
    const xs = [];
    for (let y = y0; y <= y1; y++) {
      const sy = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2) this.rect(Math.round(xs[i]), y, Math.round(xs[i + 1]) + 1, y + 1, c);
    }
  }

  sprite(s, x, y, flip = false) {
    for (let j = 0; j < s.h; j++)
      for (let i = 0; i < s.w; i++) {
        const c = s.px[j * s.w + (flip ? s.w - 1 - i : i)];
        if (c >>> 24) this.pset(x + i, y + j, c);
      }
  }

  field(fn, pal, width = 0.35) {
    const n = pal.length;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const wx = x + this.ox, wy = y + this.oy, v = fn(wx, wy);
        if (v == null || v <= 0) continue;
        this.put(y * this.w + x, pal[P.ditherIndex(v, n, wx, wy, width)]);
      }
  }

  dither(k, color) {
    if (k <= 0.02) return;
    const c = P.col(color);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (P.bt(x + this.ox, y + this.oy) < k) this.px[y * this.w + x] = c;
  }

  scaled(n) {
    const o = new Buf(this.w * n, this.h * n);
    for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.px[y * o.w + x] = this.px[((y / n) | 0) * this.w + ((x / n) | 0)];
    return o;
  }

  rgba() {
    return new Uint8Array(this.px.buffer.slice(0));
  }
}
P.Buf = Buf;

P.unpack = (c) => [c & 255, (c >>> 8) & 255, (c >>> 16) & 255];

P.volley = (t0, n, opt = {}) => {
  const r = P.rng(opt.seed ?? 1), W = opt.w ?? 240, H = opt.h ?? 135, warn = opt.warn ?? 0.7, life = opt.life ?? 0.45;
  const [w0, w1] = opt.width ?? [5, 9], safe = opt.safe, out = [];
  for (let tries = 0; out.length < n && tries < 4000; tries++) {
    const a = r() * Math.PI, x = 10 + r() * (W - 20), y = 20 + r() * (H - 40), w = w0 + r() * (w1 - w0);
    if (safe && Math.abs((safe[0] - x) * Math.sin(a) - (safe[1] - y) * Math.cos(a)) < safe[2] + w) continue;
    const ts = t0 + (opt.stagger ?? 0) * out.length;
    out.push({ x, y, a, w, warn: ts, fire: ts + warn, end: ts + warn + life });
  }
  return out;
};

P.beams = (buf, list, t, cols = [[255, 255, 255], [255, 255, 255]]) => {
  const W = buf.w, H = buf.h, light = new Float32Array(W * H);
  let glow = 0, any = false;
  for (const b of list) {
    if (t < b.warn || t >= b.end + 0.2) continue;
    const ca = Math.cos(b.a), sa = Math.sin(b.a);
    if (t < b.fire) {
      const k = (t - b.warn) / (b.fire - b.warn);
      if (!(Math.floor(t * 14) % 2 === 0 || k > 0.75)) continue;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const wx = x + buf.ox, wy = y + buf.oy, d = Math.abs((wx - b.x) * sa - (wy - b.y) * ca);
          const along = (wx - b.x) * ca + (wy - b.y) * sa;
          if (d < 0.6 && (Math.floor(along / 3) % 2 === 0 || k > 0.6)) buf.put(y * W + x, P.col(P.mix(P.unpack(buf.px[y * W + x]), cols[cols.length - 1], 0.45 + 0.45 * k)));
        }
      continue;
    }
    any = true;
    const f = t - b.fire, life = b.end - b.fire;
    const grow = 1 - Math.pow(1 - Math.min(f / 0.05, 1), 3);
    const shrink = Math.max(0, 1 - Math.pow(Math.max(0, (f - life * 0.55) / (life * 0.45 + 0.2)), 2));
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const wx = x + buf.ox, wy = y + buf.oy, d = Math.abs((wx - b.x) * sa - (wy - b.y) * ca);
        const along = (wx - b.x) * ca + (wy - b.y) * sa;
        const wob = 1 + 0.12 * Math.sin(along / 5 + f * 70) + 0.06 * Math.sin(along / 2.3 - f * 110);
        const w = b.w * grow * shrink * wob, o = Math.max(d - w, 0);
        const core = P.clamp(w - d + 0.5);
        const bloom = Math.exp(-o / (b.w * 0.6 + 1.5)) * grow * shrink;
        const scatter = Math.exp(-o / 22) * 0.18 * grow * shrink;
        const v = Math.max(core, bloom * 0.85, scatter), i = y * W + x;
        if (v > light[i]) light[i] = v;
      }
    glow += 0.06 * grow * shrink + (f < 0.06 ? 0.4 * (1 - f / 0.06) : 0);
  }
  if (any)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x, v = light[i];
        if (v <= 0.01) continue;
        const q = v * 4, base = Math.floor(q), fr = q - base;
        const lv = P.clamp((base + (fr > 0.6 || (fr > 0.4 && P.bt(x + buf.ox, y + buf.oy) - 0.5 / 16 > 0.5) ? 1 : 0)) / 4);
        if (lv <= 0) continue;
        const src = P.unpack(buf.px[i]), tint = P.ramp(cols, lv);
        buf.put(i, P.col(P.mix(src, tint, lv)));
      }
  if (glow > 0) {
    const k = Math.min(glow, 0.6) * 0.5;
    for (let i = 0; i < W * H; i++) buf.put(i, P.col(P.mix(P.unpack(buf.px[i]), [255, 255, 255], k)));
  }
  return glow;
};

P.novaNoise = () => {
  if (P.NOVA) return P.NOVA;
  const S = 160, a = new Float32Array(S * S), b = new Float32Array(S * S);
  for (let j = 0; j < S; j++)
    for (let i = 0; i < S; i++) {
      a[j * S + i] = P.noise(i * 0.16, j * 0.2);
      b[j * S + i] = P.noise(i * 0.4, j * 0.45);
    }
  return (P.NOVA = { S, a, b });
};

P.SMOKE_GREEN = {
  smoke: [[6, 22, 12], [14, 48, 24], [26, 82, 36], [44, 124, 50], [76, 176, 66], [130, 226, 98], [200, 255, 168], [240, 255, 228]],
  ring: [[236, 255, 220], [130, 240, 100], [50, 170, 60]],
  core: [[245, 255, 235], [150, 245, 120], [60, 180, 64]],
  puff: [[70, 160, 66], [34, 96, 44]],
  spark: [[220, 255, 200], [100, 230, 90]],
  gather: [[60, 170, 60], [230, 255, 210], [90, 220, 80]],
};

P.novaSmoke = (buf, x, te, t, opt = {}) => {
  const C = opt.cols || P.SMOKE_GREEN, fade = opt.fade ?? 1, front = !!opt.front, S = opt.scale ?? 1;
  if (fade <= 0 || te < -0.5) return;
  const NN = P.novaNoise(), NS = NN.S, wrap = (v) => ((Math.round(v) % NS) + NS) % NS;
  if (te < 0) {
    if (front) return;
    const c = (te + 0.5) / 0.5;
    buf.blob(x, -4 * S, (2 + 8 * c) * S, P.mix(C.gather[0], C.gather[1], c), (0.4 + 0.6 * c) * fade, 0.6);
    for (let i = 0; i < 18; i++) {
      const r = P.rng(i * 19 + 7), a = -Math.PI * r(), ph = (t * 2.4 + r()) % 1, d = (1 - ph) * (30 + r() * 24) * S;
      buf.pset(x + Math.cos(a) * d, -4 * S + Math.sin(a) * d * 0.8, ph > 0.6 ? C.gather[1] : C.gather[2]);
    }
    return;
  }
  const rings = [[-2, 130], [-20, 96], [-40, 64]].map(([y, r]) => [y * S, r * S]), ringFade = 1 - P.clamp((te - 0.35) / 0.8);
  const ring = (yo, maxR) => {
    const r = maxR * P.ease.out(P.clamp(te / 0.5)), ry = r * 0.22;
    if (ringFade <= 0 || r < 2) return;
    for (let a = 0; a < Math.PI * 2; a += 0.6 / Math.max(10, r)) {
      if (Math.sin(a) > 0 !== front) continue;
      const px = x + Math.cos(a) * r, py = yo + Math.sin(a) * ry;
      if (P.bt(px, py) >= ringFade * fade) continue;
      buf.pset(px, py, C.ring[0]);
      buf.pset(px, py - 1, C.ring[1]);
      if (P.bt(px + 1, py) < ringFade * 0.6) buf.pset(px, py + 1, C.ring[2]);
    }
  };
  if (front) {
    for (const [yo, mr] of rings) ring(yo, mr);
    for (let i = 0; i < 26; i++) {
      const r = P.rng(i * 37 + 3), ph = (te * (0.25 + r() * 0.2) + r()) % 1, px = x + ((r() - 0.5) * 110 + Math.sin(t * 2 + i) * 6) * S, py = (-2 - ph * 170) * S;
      if (P.bt(px, py) < (1 - ph) * fade) buf.pset(px, py, ph < 0.3 ? C.spark[0] : C.spark[1]);
    }
    return;
  }
  const smoke = C.smoke.map(P.col);
  const spread = 240 * S * P.ease.out(P.clamp(te / 1.4));
  for (let px = Math.max(buf.ox, Math.floor(x - spread)); px < Math.min(buf.ox + buf.w, x + spread); px++) {
    const e = Math.abs(px - x) / spread, h = (60 + 16 * Math.sin((px / S) * 0.045 + t * 0.9) + 12 * Math.sin((px / S) * 0.11 - t * 1.7)) * S * (1 - e * e * e * e), ef = fade * (e > 0.85 ? (1 - e) / 0.15 : 1);
    for (let py = Math.max(buf.oy, Math.floor(-h)); py <= 1; py++) {
      const hy = -py / h;
      const n = NN.a[wrap(py / S + te * 40) * NS + wrap(px / S + te * 6)] * 0.6 + NN.b[wrap(py / S + te * 24) * NS + wrap(px / S - te * 9)] * 0.4;
      const heat = (1 - hy) * 0.95 + (n - 0.5) * 0.9 - 0.04;
      if (heat < 0.1 || P.bt(px, py) >= ef) continue;
      buf.pset(px, py, smoke[P.ditherIndex(P.clamp(heat * 0.85), smoke.length, px, py, 0.35)]);
    }
  }
  for (let i = 0; i < 34; i++) {
    const r = P.rng(i * 53 + 11), ph = (te * (0.16 + r() * 0.1) + r()) % 1;
    if (te < ph * 3) continue;
    const px = x + ((r() - 0.5) * 70 * (0.5 + ph) + Math.sin(t * 0.8 + i) * 5) * S, py = (-6 - ph * 175) * S, sz = (6 + ph * 14 + r() * 5) * S;
    buf.blob(px, py, sz, ph < 0.4 ? C.puff[0] : C.puff[1], (1 - ph) * 0.75 * fade, 0.6);
  }
  for (const [yo, mr] of rings) ring(yo, mr);
  if (te < 1.0) {
    const w = (6 * (1 - te) + 1) * S;
    for (let y = buf.oy; y < 0; y++)
      for (let dx = -Math.ceil(w + 2); dx <= Math.ceil(w + 2); dx++) {
        const d = Math.abs(dx) / w;
        if (d > 1.4 || P.bt(x + dx, y) >= (1 - te) * fade * (d < 1 ? 1 : 1.4 - d)) continue;
        buf.pset(x + dx, y, d < 0.4 ? C.core[0] : d < 1 ? C.core[1] : C.core[2]);
      }
  }
  const R = 62 * S * P.ease.out(P.clamp(te / 0.35)) * (1 + Math.min(te, 3) * 0.08), stretch = 0.74 + 0.55 * P.ease.io(P.clamp(te / 2.4));
  const ry = R * stretch, cy = -R * 0.05 - 34 * S * P.ease.io(P.clamp(te / 2.4));
  if (R > 1)
    for (let py = Math.floor(cy - ry); py <= 1; py++)
      for (let px = Math.floor(x - R); px <= Math.ceil(x + R); px++) {
        const dx = (px - x) / R, dy = (py - cy) / ry, e = dx * dx + dy * dy;
        if (e > 1) continue;
        const n = NN.a[wrap(py / S + te * 44) * NS + wrap(px / S + te * 14)] * 0.6 + NN.b[wrap(py / S + te * 26) * NS + wrap(px / S - te * 10)] * 0.4;
        const heat = (1 - e) * 0.8 + n * 0.55 - Math.min(te, 1.4) * 0.2 - 0.06 + (py > -6 * S ? 0.1 : 0);
        if (e > 0.7 && n < 0.48 && dy < 0.3) continue;
        if (dy < -0.4 && n < 0.32 + (-dy - 0.4) * 0.5) continue;
        if (P.bt(px, py) >= fade * (e > 0.9 ? 1.6 - e : 1)) continue;
        buf.pset(px, py, smoke[P.ditherIndex(P.clamp(heat), smoke.length, px, py, 0.35)]);
      }
};

P.BREATH_GOLD = [[120, 40, 12], [210, 100, 24], [255, 170, 40], [255, 214, 90], [255, 240, 170], [255, 252, 226], [255, 255, 255]];

class Breath {
  constructor(opt = {}) {
    this.LMAX = opt.length ?? 210;
    this.ROWS = Math.ceil(this.LMAX / 2);
    this.V = 96;
    this.a = new Uint8Array(this.ROWS * this.V);
    this.seed = opt.seed ?? 0x2545f491;
    this.pal = Array.from({ length: 37 }, (_, i) => P.col(P.ramp(opt.cols || P.BREATH_GOLD, i / 36)));
    this.wind = new Float32Array(this.LMAX);
  }

  step(on = true, steps = 3) {
    const a = this.a, V = this.V, ROWS = this.ROWS;
    let sd = this.seed;
    const rnd = () => {
      sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5;
      return (sd >>> 0) / 4294967296;
    };
    for (let s = 0; s < steps; s++) {
      for (let v = 0; v < V; v++) {
        const e = Math.min(v - 16, V - 17 - v);
        a[v] = on && e >= 0 ? Math.max(0, Math.min(36, 22 + e * 1.4) - (rnd() < 0.15 ? 8 : 0)) : 0;
      }
      for (let k = ROWS - 1; k >= 1; k--) {
        const up = (k + s) & 1, o = k * V, ip = o - V;
        for (let q = 0; q < V; q++) {
          const v = up ? q : V - 1 - q, src = a[ip + v], r = rnd() * 3, ri = r | 0, nv = v + ri - 1;
          if (nv < 0 || nv >= V) continue;
          const dec = r - ri < 0.36 ? 1 : 0;
          a[o + nv] = src > dec ? src - dec : 0;
        }
      }
    }
    this.seed = sd;
  }

  draw(buf, hx, hy, aA, aB, t, open = 1, floor = buf.oy + buf.h) {
    const LMAX = this.LMAX, V = this.V, a = this.a, pal = this.pal;
    const mid = (aA + aB) / 2, half = ((aB - aA) / 2) * (0.25 + 0.75 * open) * (V - 1) / (V - 19), dA = (half * 2) / (V - 1), lo = mid - half, idA = 1 / dA;
    for (let k = 0; k < LMAX; k++) this.wind[k] = Math.sin(k * 0.06 - t * 7) * (1 + k * 0.02) - lo * idA;
    const I0 = Math.max(0, Math.floor(hx - LMAX) - buf.ox), I1 = Math.min(buf.w - 1, Math.ceil(hx + LMAX) - buf.ox);
    const J0 = Math.max(0, Math.floor(hy - LMAX) - buf.oy), J1 = Math.min(buf.h - 1, floor - buf.oy), TAU = Math.PI * 2;
    for (let j = J0; j <= J1; j++) {
      const dy = j + buf.oy + 0.5 - hy;
      for (let i = I0; i <= I1; i++) {
        const dx = i + buf.ox + 0.5 - hx, k = Math.sqrt(dx * dx + dy * dy) | 0;
        if (k < 2 || k >= LMAX) continue;
        let th = Math.atan2(dy, dx);
        if (lo > Math.PI / 2 && th < 0) th += TAU;
        const uu = th * idA + this.wind[k];
        if (uu < 0 || uu >= V) continue;
        const I = a[(k >> 1) * V + (uu | 0)];
        if (I >= 5) buf.px[j * buf.w + i] = pal[I];
      }
    }
  }
}
P.Breath = Breath;

P.HELL_FIRE = [[30, 6, 6], [110, 18, 8], [180, 40, 10], [222, 80, 14], [244, 124, 22], [252, 172, 40], [255, 214, 90], [255, 244, 186], [255, 255, 255]];

class HellFire {
  constructor(w, h, opt = {}) {
    this.w = w;
    this.h = h;
    this.a = new Uint8Array(w * h);
    this.seed = opt.seed ?? 0x9e3779b9;
    this.top = h;
    this.pal = Array.from({ length: 37 }, (_, i) => P.col(P.ramp(opt.cols || P.HELL_FIRE, i / 36)));
  }

  step(power = 1, cool = 1, steps = 1) {
    const W = this.w, H = this.h, a = this.a, src = Math.round(36 * P.clamp(power));
    let sd = this.seed, top = this.top;
    for (let s = 0; s < steps; s++) {
      for (let x = 0; x < W; x++) {
        sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5;
        a[(H - 1) * W + x] = Math.max(0, src - ((sd >>> 0) % 100 < 15 ? 6 : 0));
      }
      let newTop = H;
      for (let y = Math.max(1, top - 1); y < H; y++) {
        const row = y * W, up = row - W;
        for (let x = 0; x < W; x++) {
          const v = a[row + x];
          if (v === 0) {
            a[up + x] = 0;
            continue;
          }
          sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5;
          const rr = (sd >>> 0) % 6, r = rr % 3, dx = x + r - 1 < 0 ? 0 : x + r - 1 >= W ? W - 1 : x + r - 1;
          const nv = v - ((r & 1) + (cool > 1 && rr >= 3 ? cool - 1 : 0));
          a[up + dx] = nv > 0 ? nv : 0;
          if (nv > 0 && y - 1 < newTop) newTop = y - 1;
        }
      }
      top = newTop;
    }
    this.seed = sd;
    this.top = top;
  }

  draw(buf, x = buf.ox, ground = buf.oy + buf.h) {
    const W = this.w, H = this.h, a = this.a, bx = Math.round(x) - buf.ox, by = Math.round(ground) - H - buf.oy;
    for (let j = Math.max(0, this.top - 1, -by); j < Math.min(H, buf.h - by); j++)
      for (let i = Math.max(0, -bx); i < Math.min(W, buf.w - bx); i++) {
        const v = a[j * W + i];
        if (v > 4) buf.px[(j + by) * buf.w + i + bx] = this.pal[v];
      }
  }
}
P.HellFire = HellFire;

P.FLAME_COLS = [[110, 22, 8], [185, 45, 10], [232, 96, 20], [250, 156, 40], [255, 212, 96], [255, 246, 206]];
P.SMOKE_COLS = [[140, 140, 148], [214, 214, 220]];

class Flow {
  constructor(opt = {}, def = {}) {
    const o = { ...def, ...opt };
    this.o = o;
    const cols = o.cols || P.FLAME_COLS;
    this.rgb = o.alpha ? o.alpha.map((_, i) => P.ramp(cols, o.alpha.length > 1 ? i / (o.alpha.length - 1) : 0).map(Math.round)) : cols;
    this.pal = this.rgb.map(P.col);
    this.r = P.rng(o.seed ?? 9);
    this.bits = [];
  }

  value(dx, h) {
    return 1 - h - dx * dx;
  }

  profile(h) {
    return 1;
  }

  draw(buf, x, ground, t) {
    const o = this.o, n = this.pal.length, top = ground - o.height * 1.35, bot = ground + o.height * 0.12, warp = o.warp ?? 0, calm = o.calm ?? 0.35;
    let wide = 0;
    for (let k = 0; k <= 16; k++) wide = Math.max(wide, this.profile(-0.12 + (k / 16) * 1.47));
    const reach = o.width * wide * 1.6 + o.swayAmp + warp;
    const X0 = Math.max(buf.ox, Math.floor(x - reach)), X1 = Math.min(buf.ox + buf.w - 1, Math.ceil(x + reach));
    const Y0 = Math.max(buf.oy, Math.floor(top)), Y1 = Math.min(buf.oy + buf.h - 1, Math.ceil(bot));
    for (let wy = Y0; wy <= Y1; wy++) {
      const h = (ground - wy) / o.height, pw = this.profile(h);
      if (pw <= 0) continue;
      const sway = (P.fbm(h * 1.5, t * o.sway, 2, 7) - 0.5) * o.swayAmp * h * h, hw = Math.max(0.5, o.width * pw);
      for (let wx = X0; wx <= X1; wx++) {
        let sx = wx - sway;
        if (warp) sx += (P.fbm(sx * o.fx * 0.6, wy * o.fy * 0.6 + t * o.speed * 0.6, 2, 3) - 0.5) * warp * Math.max(0, h);
        const dx = (sx - x) / hw, nz = P.fbm(sx * o.fx, wy * o.fy + t * o.speed, 3, 1);
        const v = this.value(dx, h) + (nz - 0.5) * o.rough * (calm + h);
        if (v <= o.cut) continue;
        const k = P.ditherIndex(P.clamp(v * o.gain), n, wx, wy, o.dither), i = (wy - buf.oy) * buf.w + wx - buf.ox;
        if (!o.alpha) buf.put(i, this.pal[k]);
        else if (buf.px[i] >>> 24) buf.put(i, P.col(P.mix(P.unpack(buf.px[i]), this.rgb[k], o.alpha[k])));
        else buf.put(i, ((Math.round(o.alpha[k] * 255) << 24) | (this.pal[k] & 0xffffff)) >>> 0);
      }
    }
    const r = this.r;
    if (o.bits && r() < o.bits) this.bits.push({ x: x + (r() - 0.5) * o.width, y: ground - o.height * 0.6, vy: -0.5 - r() * 0.5, ph: r() * 6, age: 0, life: 14 + r() * 14 });
    for (const b of this.bits) {
      (b.y += b.vy), (b.x += Math.sin(b.age * 0.35 + b.ph) * 0.5), b.age++;
      const k = b.age / b.life;
      if (P.bt(b.x, b.y) < 1 - k) buf.pset(b.x, b.y, this.pal[k < 0.5 ? n - 2 : n - 3]);
    }
    this.bits = this.bits.filter((b) => b.age <= b.life);
  }
}
P.Flow = Flow;

class Flame extends Flow {
  constructor(opt = {}) {
    super(opt, { height: 48, width: 14, speed: 3.4, fx: 0.16, fy: 0.11, rough: 1.45, sway: 1.6, swayAmp: 9, bits: 0.45, cut: 0.04, gain: 1.02, dither: 0.4 });
  }

  value(dx, h) {
    return 1 - h * 1.05 - dx * dx * 0.75;
  }

  profile(h) {
    return Math.pow(Math.max(0, 1 - h * 0.85), 0.9) * Math.sqrt(P.clamp((h + 0.08) / 0.18));
  }
}
P.Flame = Flame;

class Smoke extends Flow {
  constructor(opt = {}) {
    super(opt, { cols: P.SMOKE_COLS, alpha: [0.08, 0.18, 0.32, 0.5, 0.7, 0.85], height: 84, width: 2.5, speed: 1.5, fx: 0.12, fy: 0.09, rough: 1.3, calm: 0.03, sway: 0.7, swayAmp: 8, warp: 45, bits: 0, cut: 0.02, gain: 1.1, dither: 0.5 });
  }

  value(dx, h) {
    return 0.8 - h * 0.5 - dx * dx * 0.65 - Math.max(0, h - 0.4) * 0.9;
  }

  profile(h) {
    return h < -0.02 ? 0 : 0.8 + h * 5.5;
  }
}
P.Smoke = Smoke;

P.dist2 = (a, b) => {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
};
P.nearest = (pal, c) => {
  let best = 0, bd = Infinity;
  for (let k = 0; k < pal.length; k++) {
    const dr = c[0] - pal[k][0], dg = c[1] - pal[k][1], db = c[2] - pal[k][2], d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bd) (bd = d), (best = k);
  }
  return best;
};

P.band = (v, n, x, y, strip = 1 / 3) => {
  const f = P.clamp(v) * (n - 1), k = Math.floor(f), fr = f - k;
  return Math.min(n - 1, k + (P.bt(x, y) < P.clamp((fr - 0.5) / strip + 0.5) ? 1 : 0));
};

P.hsl = (h, s, l) => {
  h = (((h % 360) + 360) % 360) / 60;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
};

P.hueRamp = (n, opt = {}) => {
  const hue = opt.hue ?? 110, shift = opt.shift ?? 60, sat = opt.sat ?? 0.55, drop = opt.satDrop ?? 0.35;
  const [l0, l1] = opt.light ?? [0.12, 0.62];
  const toward = (h, target, amt) => {
    const d = ((target - h + 540) % 360) - 180;
    return h + Math.sign(d) * Math.min(Math.abs(d), amt);
  };
  return Array.from({ length: n }, (_, i) => {
    const t = n > 1 ? i / (n - 1) : 0.5, e = Math.abs(2 * t - 1);
    const h = toward(hue, t < 0.5 ? 240 : 60, shift * e);
    return P.col(P.hsl(h, sat * (1 - drop * e), l0 + (l1 - l0) * t));
  });
};

P.toHsl = (c) => {
  const [r, g, b] = (typeof c === "number" ? P.unpack(c) : c).map((v) => v / 255);
  const M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m, l = (M + m) / 2;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = M === r ? ((g - b) / d) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
};

P.hueRampFrom = (cols, n, opt = {}) => {
  const hsl = cols.map(P.toHsl), w = hsl.map(([, s]) => s + 0.01);
  let x = 0, y = 0;
  hsl.forEach(([h], i) => ((x += Math.cos((h * Math.PI) / 180) * w[i]), (y += Math.sin((h * Math.PI) / 180) * w[i])));
  const sats = hsl.map(([, s]) => s).sort((a, b) => a - b), ls = hsl.map(([, , l]) => l);
  return P.hueRamp(n, {
    hue: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
    sat: sats[sats.length >> 1],
    light: [Math.min(...ls), Math.max(...ls)],
    ...opt,
  });
};
P.pixelPerfect = (m, w, h) => {
  const out = m.slice(), g = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : out[y * w + x]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!out[y * w + x]) continue;
    const l = g(x - 1, y), r = g(x + 1, y), u = g(x, y - 1), d = g(x, y + 1);
    if (l + r !== 1 || u + d !== 1) continue;
    const sx = l ? -1 : 1, sy = u ? -1 : 1;
    if (!g(x + sx, y + sy) && !g(x - sx, y) && !g(x, y - sy)) out[y * w + x] = 0;
  }
  return out;
};
P.blit = (buf, ctx, x = 0, y = 0) => ctx.putImageData(new ImageData(new Uint8ClampedArray(buf.px.buffer.slice(0)), buf.w, buf.h), x, y);

module.exports = P;
