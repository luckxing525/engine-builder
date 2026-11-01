/* Lightweight canvas line charts with a synced crosshair */
const Charts = (function () {
  'use strict';
  const charts = [];
  let hoverRpm = null;
  const listeners = [];

  function niceStep(range, target) {
    const raw = range / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  function create(canvas, opts) {
    const ch = { canvas, opts, data: null };
    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      if (!ch.layout) return;
      const { pl, pw, xMin, xMax } = ch.layout;
      const rpm = xMin + (x - pl) / pw * (xMax - xMin);
      setHover(rpm >= xMin && rpm <= xMax ? rpm : null);
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('touchmove', onMove, { passive: true });
    canvas.addEventListener('mouseleave', () => setHover(null));
    charts.push(ch);
    return ch;
  }

  function setHover(r) { hoverRpm = r; charts.forEach(draw); listeners.forEach(f => f(r)); }
  function onHover(f) { listeners.push(f); }

  function setData(ch, data) { ch.data = data; draw(ch); }

  function draw(ch) {
    const { canvas, data } = ch;
    if (!data || !canvas.isConnected || canvas.offsetParent === null) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const pl = 52, pr = 14, pt = 10, pb = data.xAxis ? 26 : 10;
    const pw = W - pl - pr, ph = H - pt - pb;
    const xMin = data.xMin, xMax = data.xMax;
    // y range
    let yMax = -Infinity, yMin = data.yMin != null ? data.yMin : 0;
    data.series.forEach(s => s.y.forEach(v => { if (isFinite(v)) yMax = Math.max(yMax, v); }));
    if (!isFinite(yMax)) yMax = 1;
    if (data.yMaxFixed) yMax = data.yMaxFixed;
    if (data.yMin == null) {
      data.series.forEach(s => s.y.forEach(v => { if (isFinite(v)) yMin = Math.min(yMin, v); }));
    }
    const step = niceStep((yMax - yMin) || 1, Math.max(2, Math.floor(ph / 34)));
    yMax = Math.ceil(yMax * 1.04 / step) * step;
    yMin = Math.floor(yMin / step) * step;
    ch.layout = { pl, pw, xMin, xMax };
    const X = r => pl + (r - xMin) / (xMax - xMin) * pw;
    const Y = v => pt + ph - (v - yMin) / (yMax - yMin) * ph;
    const tx2 = css('--text-2'), grid = css('--grid'), tx3 = css('--text-3');
    g.font = '11px "JetBrains Mono", ui-monospace, monospace';
    // redline zone
    if (data.redline && data.redline < xMax) {
      g.fillStyle = 'rgba(208,59,59,0.10)';
      g.fillRect(X(data.redline), pt, X(xMax) - X(data.redline), ph);
    }
    // grid + y labels
    g.strokeStyle = grid; g.lineWidth = 1; g.fillStyle = tx3; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let v = yMin; v <= yMax + 1e-9; v += step) {
      const y = Math.round(Y(v)) + 0.5;
      g.beginPath(); g.moveTo(pl, y); g.lineTo(pl + pw, y); g.stroke();
      g.fillText(fmt(v, step), pl - 8, y);
    }
    // x labels
    const xs = niceStep(xMax - xMin, Math.max(3, Math.floor(pw / 70)));
    g.textAlign = 'center'; g.textBaseline = 'top';
    for (let r = Math.ceil(xMin / xs) * xs; r <= xMax; r += xs) {
      const x = Math.round(X(r)) + 0.5;
      g.strokeStyle = grid; g.beginPath(); g.moveTo(x, pt); g.lineTo(x, pt + ph); g.stroke();
      if (data.xAxis) { g.fillStyle = tx3; g.fillText(r >= 1000 ? (r / 1000) + 'k' : r, x, pt + ph + 7); }
    }
    // y unit label
    g.save(); g.fillStyle = tx2; g.textAlign = 'left'; g.textBaseline = 'top'; g.font = '600 11px Inter, system-ui, sans-serif';
    g.fillText(data.unit || '', 6, 2); g.restore();
    // series
    g.save();
    g.beginPath(); g.rect(pl, pt - 2, pw, ph + 4); g.clip();
    data.series.forEach(s => {
      g.strokeStyle = s.color; g.lineWidth = s.width || 2; g.setLineDash(s.dash || []);
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      let started = false;
      for (let i = 0; i < s.x.length; i++) {
        if (s.clip != null && s.x[i] > s.clip) break;
        const v = s.y[i]; if (!isFinite(v)) continue;
        const x = X(s.x[i]), y = Y(v);
        if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
      }
      if (s.clip != null && started) {
        // interpolate the endpoint exactly at clip
        const v = interp(s.x, s.y, s.clip);
        if (isFinite(v)) g.lineTo(X(s.clip), Y(v));
      }
      g.stroke();
      if (s.fill) {
        g.setLineDash([]);
        g.lineTo(X(s.clip != null ? Math.min(s.clip, s.x[s.x.length - 1]) : s.x[s.x.length - 1]), Y(Math.max(0, yMin)));
        g.lineTo(X(s.x[0]), Y(Math.max(0, yMin)));
        g.closePath(); g.fillStyle = s.fill; g.fill();
      }
      g.setLineDash([]);
    });
    // live dyno head
    if (data.liveRpm != null) {
      const s = data.series[0];
      const v = interp(s.x, s.y, data.liveRpm);
      if (isFinite(v)) {
        g.fillStyle = css('--surface-1'); g.beginPath(); g.arc(X(data.liveRpm), Y(v), 6, 0, 7); g.fill();
        g.fillStyle = s.color; g.beginPath(); g.arc(X(data.liveRpm), Y(v), 4.5, 0, 7); g.fill();
      }
    }
    // peak marker (selective direct label)
    if (data.peak && data.liveRpm == null) {
      const s = data.series[0];
      const x = X(data.peak.x), y = Y(data.peak.y);
      g.fillStyle = css('--surface-1'); g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill();
      g.fillStyle = s.color; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
      g.font = '600 11px "JetBrains Mono", ui-monospace, monospace';
      g.fillStyle = css('--text-1'); g.textBaseline = 'bottom';
      const label = data.peak.label;
      const tw = g.measureText(label).width;
      g.textAlign = x + tw / 2 + 4 > pl + pw ? 'right' : x - tw / 2 - 4 < pl ? 'left' : 'center';
      g.fillText(label, x, y - 9 < pt + 12 ? y + 22 : y - 9);
    }
    g.restore();
    // crosshair
    if (hoverRpm != null) {
      const x = Math.round(X(hoverRpm)) + 0.5;
      g.strokeStyle = tx2; g.lineWidth = 1; g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(x, pt); g.lineTo(x, pt + ph); g.stroke(); g.setLineDash([]);
      data.series.forEach(s => {
        if (s.noHover) return;
        const v = interp(s.x, s.y, hoverRpm);
        if (!isFinite(v)) return;
        g.fillStyle = css('--surface-1'); g.beginPath(); g.arc(x, Y(v), 5, 0, 7); g.fill();
        g.fillStyle = s.color; g.beginPath(); g.arc(x, Y(v), 3.5, 0, 7); g.fill();
      });
    }
  }

  function interp(xs, ys, x) {
    if (!xs.length || x < xs[0] || x > xs[xs.length - 1]) return NaN;
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
    const t = (x - xs[lo]) / ((xs[hi] - xs[lo]) || 1);
    return ys[lo] * (1 - t) + ys[hi] * t;
  }
  function fmt(v, step) {
    if (step < 0.1) return v.toFixed(2);
    if (step < 1) return v.toFixed(1);
    return Math.round(v).toString();
  }
  function redrawAll() { charts.forEach(draw); }
  return { create, setData, draw, redrawAll, interp, onHover, get hover() { return hoverRpm; }, setHover };
})();
