/* Engine animation, gauges and drag-strip rendering */
const Viz = (function () {
  'use strict';
  function fit(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g, W, H };
  }
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  /* ---------------- engine cutaway ---------------- */
  function strokeOf(phi) {
    // phi: 0..720 from firing TDC
    if (phi < 180) return 'power';
    if (phi < 360) return 'exhaust';
    if (phi < 540) return 'intake';
    return 'compression';
  }
  const STROKE_COL = { power: '#ec835a', exhaust: '#7d7b74', intake: '#3987e5', compression: '#9085e9' };

  function pistonPos(phi, lr) {
    const a = phi * Math.PI / 180;
    const r = 1, l = lr;
    const x = r * (1 - Math.cos(a)) + (l - Math.sqrt(l * l - r * r * Math.sin(a) ** 2));
    return x / 2; // 0 TDC .. 1 BDC
  }

  function drawCylinder(g, cx, cy, ang, len, wid, phi, opts) {
    // cylinder axis points from crank (cx,cy) outward at angle ang (radians, 0 = up)
    g.save();
    g.translate(cx, cy);
    g.rotate(ang);
    const crankR = len * 0.2;
    const rod = len * 0.55;
    const a = phi * Math.PI / 180;
    // crank pin
    const pinX = Math.sin(a) * crankR, pinY = -Math.cos(a) * crankR;
    const pos = pistonPos(phi, rod / crankR);
    const deckY = -(crankR + rod + wid * 0.55 + crankR * 0.05) - wid * 0.1;
    const pistonTop = deckY + wid * 0.12 + pos * crankR * 2;
    const pistonH = wid * 0.62;
    const st = strokeOf(phi);
    // bore
    g.fillStyle = 'rgba(255,255,255,0.035)';
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = 1.2;
    const boreTop = deckY - 2, boreBot = -crankR * 0.2 - rod * 0.35 + 6;
    g.fillRect(-wid / 2, boreTop, wid, boreBot - boreTop);
    g.beginPath(); g.moveTo(-wid / 2, boreTop); g.lineTo(-wid / 2, boreBot); g.moveTo(wid / 2, boreTop); g.lineTo(wid / 2, boreBot); g.stroke();
    // combustion chamber gas
    const gasH = pistonTop - deckY;
    let gasCol = STROKE_COL[st];
    let alpha = st === 'power' ? Math.max(0.25, 1 - phi / 180) : 0.32;
    if (opts.cut && st === 'power') { gasCol = '#4a4945'; alpha = 0.3; }
    const ga0 = g.globalAlpha;
    g.globalAlpha = ga0 * alpha;
    g.fillStyle = gasCol;
    g.fillRect(-wid / 2 + 1, deckY, wid - 2, gasH);
    g.globalAlpha = ga0;
    // combustion flash
    if (st === 'power' && phi < 45 && !opts.cut && opts.running) {
      const k = 1 - phi / 45;
      const grd = g.createRadialGradient(0, deckY + gasH * 0.3, 1, 0, deckY + gasH * 0.3, wid * 0.9);
      grd.addColorStop(0, `rgba(255,240,200,${0.95 * k})`);
      grd.addColorStop(0.4, `rgba(255,170,60,${0.7 * k})`);
      grd.addColorStop(1, 'rgba(255,90,20,0)');
      g.fillStyle = grd;
      g.fillRect(-wid, deckY - wid * 0.4, wid * 2, gasH + wid * 0.8);
    }
    // head + valves
    g.fillStyle = '#2b2a27';
    g.fillRect(-wid / 2 - 3, deckY - wid * 0.42, wid + 6, wid * 0.42);
    const lift = (start, dur) => { let p = (phi - start + 720) % 720; return p < dur ? Math.sin(p / dur * Math.PI) : 0; };
    const ex = lift(150, 250), inn = lift(345, 250);
    g.strokeStyle = '#a9a79f'; g.lineWidth = 2;
    const vw = wid * 0.18;
    [[-wid * 0.24, inn, '#3987e5'], [wid * 0.24, ex, '#9a9890']].forEach(([vx, l, col]) => {
      const vy = deckY + l * wid * 0.14;
      g.strokeStyle = col; g.beginPath(); g.moveTo(vx, vy - wid * 0.38); g.lineTo(vx, vy); g.stroke();
      g.beginPath(); g.moveTo(vx - vw, vy); g.lineTo(vx + vw, vy); g.stroke();
    });
    // spark plug
    g.fillStyle = '#d9d7cf'; g.fillRect(-1.5, deckY - wid * 0.4, 3, wid * 0.36);
    if (opts.running && !opts.cut && (phi > 708 || phi < 6)) {
      g.fillStyle = '#ffffff'; g.shadowColor = '#9fd0ff'; g.shadowBlur = 10;
      g.beginPath(); g.arc(0, deckY + 2, 3, 0, 7); g.fill(); g.shadowBlur = 0;
    }
    // conrod
    g.strokeStyle = '#8b8982'; g.lineWidth = Math.max(3, wid * 0.16); g.lineCap = 'round';
    g.beginPath(); g.moveTo(pinX, pinY); g.lineTo(0, pistonTop + pistonH * 0.55); g.stroke();
    // piston
    const pg = g.createLinearGradient(-wid / 2, 0, wid / 2, 0);
    pg.addColorStop(0, '#6d6b65'); pg.addColorStop(0.5, '#c9c7bf'); pg.addColorStop(1, '#6d6b65');
    g.fillStyle = pg;
    g.fillRect(-wid / 2 + 2, pistonTop, wid - 4, pistonH);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(-wid / 2 + 2, pistonTop + pistonH * 0.18, wid - 4, 1.5);
    g.fillRect(-wid / 2 + 2, pistonTop + pistonH * 0.32, wid - 4, 1.5);
    // crank web
    g.fillStyle = '#55534e';
    g.beginPath(); g.arc(0, 0, crankR * 0.55, 0, 7); g.fill();
    g.strokeStyle = '#55534e'; g.lineWidth = crankR * 0.7;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(pinX, pinY); g.stroke();
    g.fillStyle = '#b8b6ad'; g.beginPath(); g.arc(pinX, pinY, crankR * 0.28, 0, 7); g.fill();
    g.restore();
  }

  function drawRotor(g, cx, cy, R, theta, fireAng, opts) {
    // epitrochoid housing
    const e = R * 0.15;
    g.save(); g.translate(cx, cy);
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; g.fillStyle = 'rgba(255,255,255,0.035)';
    g.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = i / 120 * Math.PI * 2;
      const x = e * Math.cos(3 * a) + R * Math.cos(a);
      const y = e * Math.sin(3 * a) + R * Math.sin(a);
      // rotate so long axis vertical
      if (i === 0) g.moveTo(y, x); else g.lineTo(y, x);
    }
    g.closePath(); g.fill(); g.stroke();
    // shaft angle (theta deg of eccentric shaft)
    const sa = theta * Math.PI / 180;
    const ra = sa / 3;
    const ox = e * Math.cos(sa), oy = e * Math.sin(sa);
    // combustion region glows near the plug side when firing
    const phi = ((theta - fireAng) % 360 + 360) % 360;
    if (opts.running && !opts.cut && phi < 90) {
      const k = 1 - phi / 90;
      const grd = g.createRadialGradient(R * 0.55, 0, 2, R * 0.55, 0, R * 0.8);
      grd.addColorStop(0, `rgba(255,230,180,${0.9 * k})`); grd.addColorStop(0.5, `rgba(255,140,40,${0.6 * k})`); grd.addColorStop(1, 'rgba(255,90,20,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(R * 0.55, 0, R * 0.8, 0, 7); g.fill();
    }
    // rotor (Reuleaux-ish triangle)
    g.save(); g.translate(oy, ox); g.rotate(-ra);
    const r2 = R * 0.86;
    const pts = [0, 1, 2].map(k => [Math.cos(k * 2.0944) * r2, Math.sin(k * 2.0944) * r2]);
    const pg = g.createRadialGradient(0, 0, 2, 0, 0, r2);
    pg.addColorStop(0, '#c9c7bf'); pg.addColorStop(1, '#6d6b65');
    g.fillStyle = pg; g.strokeStyle = '#2b2a27'; g.lineWidth = 1.5;
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      const [x1, y1] = pts[k], [x2, y2] = pts[(k + 1) % 3];
      const mx = (x1 + x2) / 2 * 1.18, my = (y1 + y2) / 2 * 1.18;
      if (k === 0) g.moveTo(x1, y1);
      g.quadraticCurveTo(mx, my, x2, y2);
    }
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#2b2a27'; g.beginPath(); g.arc(0, 0, R * 0.22, 0, 7); g.fill();
    g.restore();
    // eccentric shaft
    g.fillStyle = '#b8b6ad'; g.beginPath(); g.arc(0, 0, R * 0.09, 0, 7); g.fill();
    // plugs
    g.fillStyle = '#d9d7cf'; g.fillRect(R * 0.95, -R * 0.2, R * 0.12, 3); g.fillRect(R * 0.95, R * 0.15, R * 0.12, 3);
    g.restore();
  }

  function drawEngine(canvas, cfg, events, theta, st) {
    const { g, W, H } = fit(canvas);
    g.clearRect(0, 0, W, H);
    if (!cfg || !events) return;
    const L = cfg.layout, n = cfg.cyl;
    const running = st.running, cut = st.cut;
    const opts = { running, cut };
    const fireOf = {};
    events.forEach(e => { if (fireOf[e.cyl] == null) fireOf[e.cyl] = e.angle; });
    const phiOf = (cyl) => (((theta - (fireOf[cyl] || 0)) % 720) + 720) % 720;
    if (L === 'R') {
      const R = Math.min(W / (n * 2.4 + 0.4), H / 2.8);
      for (let r = 0; r < n; r++) {
        const cx = W / 2 + (r - (n - 1) / 2) * R * 2.4;
        drawRotor(g, cx, H / 2, R, theta % 1080 + r * 360 / n, 0, opts);
      }
      return;
    }
    const bore = cfg.bore, strk = cfg.stroke;
    if (L === 'I') {
      const cols = n;
      const wid = Math.min(62, (W - 30) / cols * 0.74) * Math.min(1.1, Math.max(0.8, bore / 86));
      const len = Math.min(H * 0.74, wid * 2.5 * Math.min(1.3, Math.max(0.75, strk / 86)));
      for (let i = 0; i < n; i++) {
        const cx = W / 2 + (i - (n - 1) / 2) * (W - 30) / cols;
        drawCylinder(g, cx, H * 0.86, 0, len, wid, phiOf(i + 1), opts);
      }
    } else if (L === 'V' || L === 'W') {
      const banks = L === 'W' ? 4 : 2;
      const per = Math.ceil(n / banks);
      const va = (cfg.vAngle || 90) * Math.PI / 180;
      const angs = L === 'W' ? [-va / 2 - 0.13, -va / 2 + 0.13, va / 2 - 0.13, va / 2 + 0.13] : [-va / 2, va / 2];
      if (n === 2) {
        const len = Math.min(H * 0.9 / (Math.cos(va / 2) * 0.98 + 0.3), W * 0.8 / (2 * Math.sin(va / 2) + 0.4)), wid = len * 0.32;
        drawCylinder(g, W / 2, H - len * 0.26, -va / 2, len, wid, phiOf(1), opts);
        drawCylinder(g, W / 2, H - len * 0.26, va / 2, len, wid, phiOf(2), opts);
        return;
      }
      const half = Math.max(va / 2, 0.2) + (L === 'W' ? 0.13 : 0);
      const dx = W * (per > 6 ? 0.045 : per > 4 ? 0.06 : 0.09), dy = -H * 0.03;
      const spread = 2 * Math.sin(half) + 0.3;
      const len = Math.min((H * 0.9 + (per - 1) * dy) / (Math.cos(half) * 0.98 + 0.3), (W * 0.94 - (per - 1) * dx) / spread);
      const wid = len * (L === 'W' ? 0.2 : 0.25);
      const baseX = W / 2 - (per - 1) * dx / 2, baseY = H - len * 0.26;
      // draw rear-to-front so front cylinders overlap
      for (let k = per - 1; k >= 0; k--) {
        for (let b = 0; b < banks; b++) {
          const idx = b + k * banks;
          if (idx >= n) continue;
          const cyl = L === 'V' ? (cfg.crank === 'cross' && n === 8 ? (b === 0 ? 2 * k + 1 : 2 * k + 2) : (b === 0 ? k + 1 : per + k + 1)) : idx + 1;
          const cx = baseX + k * dx, cy = baseY + k * dy;
          g.globalAlpha = k === 0 ? 1 : Math.max(0.45, 1 - k * 0.14);
          drawCylinder(g, cx, cy, angs[b], len, wid, phiOf(cyl), { running, cut });
          g.globalAlpha = 1;
        }
      }
    } else if (L === 'F') {
      const per = n / 2;
      const wid = Math.min(34, (H - 20) / per * 0.75);
      const len = Math.min(W * 0.36, wid * 2.6);
      for (let k = 0; k < per; k++) {
        const cy = H / 2 + (k - (per - 1) / 2) * (H - 20) / per;
        drawCylinder(g, W / 2, cy, -Math.PI / 2, len, wid, phiOf(2 * k + 1), opts);
        drawCylinder(g, W / 2, cy, Math.PI / 2, len, wid, phiOf(2 * k + 2), opts);
      }
    }
  }

  /* ---------------- tachometer ---------------- */
  function drawTach(canvas, rpm, redline, maxRpm, opts) {
    const { g, W, H } = fit(canvas);
    g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.56, R = Math.min(W * 0.46, H * 0.52);
    const a0 = Math.PI * 0.78, a1 = Math.PI * 2.22;
    const A = r => a0 + (a1 - a0) * Math.min(1.02, r / maxRpm);
    g.lineCap = 'butt';
    g.lineWidth = 8; g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
    g.strokeStyle = '#d03b3b';
    g.beginPath(); g.arc(cx, cy, R, A(redline), a1); g.stroke();
    // active arc
    g.strokeStyle = rpm >= redline * 0.97 ? '#d03b3b' : css('--series-1');
    g.beginPath(); g.arc(cx, cy, R, a0, A(rpm)); g.stroke();
    // ticks
    const step = maxRpm > 12000 ? 2000 : 1000;
    g.fillStyle = css('--text-3'); g.font = '10px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let r = 0; r <= maxRpm + 1; r += step) {
      const a = A(r);
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12)); g.lineTo(cx + Math.cos(a) * (R - 5), cy + Math.sin(a) * (R - 5)); g.stroke();
      g.fillText(String(r / 1000), cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22));
    }
    // needle
    const a = A(rpm);
    g.strokeStyle = '#f0efec'; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - Math.cos(a) * 10, cy - Math.sin(a) * 10); g.lineTo(cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8)); g.stroke();
    g.fillStyle = '#f0efec'; g.beginPath(); g.arc(cx, cy, 4.5, 0, 7); g.fill();
    // digital
    const big = opts && opts.hud;
    g.fillStyle = css('--text-1'); g.font = big ? '600 13px "JetBrains Mono", monospace' : '600 20px "JetBrains Mono", monospace';
    g.fillText(Math.round(rpm).toString(), cx, cy + R * (big ? 0.64 : 0.45));
    g.fillStyle = css('--text-3'); g.font = '10px Inter, sans-serif';
    if (!big) g.fillText('RPM', cx, cy + R * 0.45 + 17);
    if (opts && opts.gear) {
      g.fillStyle = big ? '#fab219' : css('--text-1'); g.font = big ? '700 30px "JetBrains Mono", monospace' : '700 16px "JetBrains Mono", monospace';
      g.fillText(opts.gear, cx, big ? cy + R * 0.3 : cy - R * 0.38);
    }
    if (opts && opts.shiftLight) {
      g.fillStyle = '#d03b3b'; g.beginPath(); g.arc(cx, cy - R * 0.62, 5, 0, 7); g.fill();
    }
  }

  function drawBoost(canvas, psi, maxPsi, vac) {
    const { g, W, H } = fit(canvas);
    g.clearRect(0, 0, W, H);
    const pad = 4;
    const lo = -14, hi = Math.max(10, Math.ceil(maxPsi / 5) * 5 + 5);
    const X = v => pad + (v - lo) / (hi - lo) * (W - pad * 2);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(pad, H / 2 - 4, W - pad * 2, 8);
    const v = vac ? -12 + 12 * Math.max(0, Math.min(1, psi)) : psi;
    const x0 = X(0);
    g.fillStyle = v >= 0 ? css('--series-3') : 'rgba(255,255,255,0.35)';
    if (v >= 0) g.fillRect(x0, H / 2 - 4, X(v) - x0, 8); else g.fillRect(X(v), H / 2 - 4, x0 - X(v), 8);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(x0 - 0.5, H / 2 - 7, 1, 14);
  }

  /* ---------------- drag strip ---------------- */
  const MI = 1609.344, QM = MI / 4;
  function drawStrip(canvas, me, rival, tree, info) {
    const { g, W, H } = fit(canvas);
    const FIN = (info && info.finish) || QM;
    g.clearRect(0, 0, W, H);
    // sky/ground
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#15151a'); sky.addColorStop(0.45, '#1d1d22'); sky.addColorStop(0.46, '#232321'); sky.addColorStop(1, '#141413');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const pxPerM = W / 70;
    const camX = Math.max(0, (me ? me.x : 0) - 12);
    const toX = (m) => (m - camX) * pxPerM + W * 0.12;
    const laneY = [H * 0.6, H * 0.82];
    // lane lines & distance markers
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
    [H * 0.5, H * 0.71, H * 0.93].forEach(y => { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); });
    // grandstand silhouettes / poles parallax
    for (let m = Math.floor(camX / 25) * 25 - 50; m < camX + 120; m += 25) {
      const x = (m - camX * 0.6) * pxPerM * 0.6 + W * 0.1;
      g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(x, H * 0.18, 3, H * 0.27);
      g.fillStyle = 'rgba(255,220,150,0.18)'; g.fillRect(x - 4, H * 0.17, 11, 3);
    }
    const marks = [[0, 'START'], [18.288, '60 ft'], [100.584, '330 ft'], [MI / 8, '1/8 mi'], [304.8, '1000 ft']].filter(m => m[0] < FIN - 1).concat([[FIN, 'FINISH']]);
    g.font = '600 10px "JetBrains Mono", monospace'; g.textAlign = 'center';
    marks.forEach(([m, label]) => {
      const x = toX(m);
      if (x < -40 || x > W + 40) return;
      g.strokeStyle = m === FIN || m === 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)';
      g.lineWidth = m === FIN ? 3 : 1.5;
      g.beginPath(); g.moveTo(x, H * 0.5); g.lineTo(x, H * 0.93); g.stroke();
      g.fillStyle = css('--text-2'); g.fillText(label, x, H * 0.47);
      if (m === FIN) {
        for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#fff' : '#111'; g.fillRect(x - 3, H * 0.5 + k * (H * 0.43 / 8), 6, H * 0.43 / 8); }
      }
    });
    // tick every 10 m
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let m = Math.floor(camX / 10) * 10; m < camX + 80; m += 10) g.fillRect(toX(m), H * 0.93, 1, 5);
    const drawCar = (s, y, col, label) => {
      if (!s) return;
      const x = toX(s.x);
      const len = 4.4 * pxPerM, h = 1.15 * pxPerM;
      // smoke
      if (s.spin) {
        for (let k = 0; k < 6; k++) {
          g.fillStyle = `rgba(220,220,220,${0.08 + Math.random() * 0.1})`;
          g.beginPath(); g.arc(x - len - Math.random() * len * 1.2, y - h * 0.2 - Math.random() * h, h * (0.3 + Math.random() * 0.6), 0, 7); g.fill();
        }
      }
      // flames on pops
      if (s.flame) {
        g.fillStyle = 'rgba(255,150,40,0.9)';
        g.beginPath(); g.moveTo(x - len, y - h * 0.25); g.lineTo(x - len - h * (0.6 + Math.random()), y - h * 0.18); g.lineTo(x - len, y - h * 0.1); g.fill();
      }
      // side profile, rear (u=0) on the left, nose (u=1) on the right — driving toward the finish
      const P = (u, k) => [x - len + u * len, y - h * k];
      const poly = (pts) => { g.beginPath(); pts.forEach(([u, k], i) => { const [px, py] = P(u, k); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); g.fill(); };
      g.fillStyle = col;
      poly([[0, 0.15], [0, 0.62], [0.05, 0.7], [0.25, 0.74], [0.37, 1.1], [0.58, 1.14], [0.73, 0.78], [0.95, 0.6], [1, 0.45], [1, 0.15]]);
      g.fillStyle = 'rgba(10,10,12,0.78)';
      poly([[0.31, 0.76], [0.4, 1.04], [0.56, 1.07], [0.67, 0.78]]);
      // rear wing, taillight, headlight
      g.fillStyle = col; poly([[0.0, 0.7], [0.02, 0.95], [0.12, 0.95], [0.1, 0.72]]);
      g.fillStyle = '#e04040'; poly([[0, 0.5], [0, 0.6], [0.025, 0.6], [0.025, 0.5]]);
      g.fillStyle = '#fff3c8'; poly([[0.965, 0.5], [0.99, 0.5], [0.995, 0.56], [0.95, 0.58]]);
      const wr = h * 0.36;
      [x - len * 0.8, x - len * 0.2].forEach(wx => {
        g.fillStyle = '#0c0c0c'; g.beginPath(); g.arc(wx, y - wr * 0.6, wr, 0, 7); g.fill();
        g.strokeStyle = '#8b8982'; g.lineWidth = 1.5;
        const a = s.x / 0.33;
        g.beginPath(); g.moveTo(wx, y - wr * 0.6); g.lineTo(wx + Math.cos(a) * wr * 0.7, y - wr * 0.6 + Math.sin(a) * wr * 0.7); g.stroke();
      });
      g.fillStyle = css('--text-1'); g.font = '600 10px Inter, sans-serif'; g.textAlign = 'center';
      g.fillText(label, x - len / 2, y - h * 1.45);
    };
    if (rival) drawCar(rival, laneY[0], css('--series-2'), info.rivalName || 'Rival');
    if (me) drawCar(me, laneY[1], css('--series-1'), 'You');
    // christmas tree
    if (tree) {
      const tx = W - 46, ty = 14;
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(tx - 14, ty - 6, 40, 108);
      const lights = ['#fab219', '#fab219', '#fab219', '#0ca30c'];
      lights.forEach((c, i) => {
        const on = tree.stage > i;
        [0, 14].forEach(dx => {
          g.fillStyle = on ? c : 'rgba(255,255,255,0.08)';
          if (on) { g.shadowColor = c; g.shadowBlur = 12; }
          g.beginPath(); g.arc(tx + dx - 2, ty + 12 + i * 24, 8, 0, 7); g.fill(); g.shadowBlur = 0;
        });
      });
    }
    // progress minimap
    const mx = 14, mw = W - 28 - (tree ? 60 : 0), my = 12;
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(mx, my, mw, 4);
    if (rival) { g.fillStyle = css('--series-2'); g.fillRect(mx + Math.min(1, rival.x / FIN) * mw - 2, my - 3, 4, 10); }
    if (me) { g.fillStyle = css('--series-1'); g.fillRect(mx + Math.min(1, me.x / FIN) * mw - 2, my - 3, 4, 10); }
  }

  return { drawEngine, drawTach, drawBoost, drawStrip, fit };
})();
