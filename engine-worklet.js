/* Torquesmith engine synth (AudioWorklet) */
class EngineSynth {
  constructor(sr) {
    this.sr = sr;
    this.cfg = null;
    this.st = { skid: 0, ek: 0, rpm: 0, throttle: 0, load: 0, boost: 0, cut: false, running: false, kers: 0, gearF: 0, gearA: 0, crank: false, mic: 'exhaust', room: 0.1, volume: 0.8, scBoost: 0 };
    this.skidS = 0; this.skPh = 0; this.bpSkid = null; this.ekS = 0; this.ePh = 0; this.ePh2 = 0; this.rpmS = 0; this.thrS = 0; this.loadS = 0; this.boostS = 0; this.kersS = 0; this.gearFS = 0; this.gearAS = 0;
    this.phase = 0; this.nextAt = 0; this.ei = 0;
    this.seed = 12345;
    this.t = 0;
    this.oneShots = [];
    this.tPh = 0; this.tPh2 = 0; this.scPh = 0; this.kPh = 0; this.gPh = 0; this.stPh = 0;
    // reverb
    const sc = sr / 44100;
    this.combs = [1116, 1188, 1277, 1356, 1422, 1491].map(n => ({ buf: new Float32Array(Math.floor(n * sc)), i: 0, lp: 0 }));
    this.aps = [556, 441, 341].map(n => ({ buf: new Float32Array(Math.floor(n * sc)), i: 0 }));
    this.dcL = { x: 0, y: 0 }; this.dcR = { x: 0, y: 0 };
    this.ground = new Float32Array(2048); this.gi = 0;
    this.bpI = this.biq(); this.bpT = this.biq(); this.bpB = this.biq(); this.lpCab = this.biq(); this.lpCabR = this.biq();
    this.bpItb = this.biq(); this.hpMech = this.biq(); this.bpPop = this.biq(); this.lpBay = this.biq(); this.lpBayR = this.biq();
    this.intEnv = 0;
    this.lopeT = 0; this.lopeV = 0;
    this.mech = [];
    this.setBiq(this.hpMech, 'hp', 3500, 0.7);
    this.setBiq(this.lpCab, 'lp', 900, 0.6); this.setBiq(this.lpCabR, 'lp', 900, 0.6);
    this.setBiq(this.lpBay, 'lp', 1400, 0.7); this.setBiq(this.lpBayR, 'lp', 1400, 0.7);
    this.banks = [];
    this.coefT = 0; this.cutPrev = false;
    this.popCool = 0;
    this.pops = [];          // active pop/bang voices
    this.overrun = 0;        // 0..1 burble window after a throttle lift
    this.liftArmed = false;  // set while on throttle, consumed on lift
    this.popStreak = 0;      // pops cluster into bursts
    this.popEcho = new Float32Array(Math.ceil(sr * 0.12)); this.popEi = 0;
  }
  rand() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  nz() { return this.rand() * 2 - 1; }
  gauss() { return (this.rand() + this.rand() + this.rand() - 1.5) * 0.8; }
  biq() { return { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, x1: 0, x2: 0, y1: 0, y2: 0 }; }
  setBiq(f, type, fc, Q, gainDb) {
    const w = 2 * Math.PI * Math.min(fc, this.sr * 0.45) / this.sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * Q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else { // peaking
      const A = Math.pow(10, (gainDb || 0) / 40);
      b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A;
    }
    f.b0 = b0 / a0; f.b1 = b1 / a0; f.b2 = b2 / a0; f.a1 = a1 / a0; f.a2 = a2 / a0;
  }
  bq(f, x) {
    const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
    f.x2 = f.x1; f.x1 = x; f.y2 = f.y1; f.y1 = (y > 1e6 || y < -1e6 || y !== y) ? 0 : y;
    return f.y1;
  }

  setConfig(c) {
    this.cfg = c;
    const sr = this.sr;
    this.banks = [];
    for (let b = 0; b < c.bankCount; b++) {
      const hd = Math.max(8, Math.floor(sr * c.headerMs[b % c.headerMs.length] / 1000));
      const td = Math.max(16, Math.floor(sr * c.tailMs * (1 + 0.07 * b) / 1000));
      const bank = {
        pulses: [], hbuf: new Float32Array(4096), hi: 0, hd, hlp: 0,
        tbuf: new Float32Array(8192), ti: 0, td, tlp: 0,
        lp1: this.biq(), lp2: this.biq(), body: this.biq(), body2: this.biq(), hiss: this.biq(), tlp2: this.biq(),
        pan: c.pans[b] || 0, env: 0,
      };
      this.setBiq(bank.lp1, 'lp', c.mufLP, 0.75);
      this.setBiq(bank.lp2, 'lp', c.turbo ? c.mufLP * 0.7 : c.mufLP * 1.6, 0.6);
      this.setBiq(bank.body, 'pk', c.bodyHz * (1 + 0.05 * b), 1.6, c.bodyDb);
      this.setBiq(bank.body2, 'pk', c.bodyHz * 2.7, 2.2, c.bodyDb * 0.5);
      this.setBiq(bank.hiss, 'bp', c.hissHz, 0.8);
      this.banks.push(bank);
    }
    // event gaps
    const ev = c.events;
    this.gaps = ev.map((e, i) => {
      const n = ev[(i + 1) % ev.length];
      let g = n.angle - e.angle; if (g <= 0) g += c.cycle; return g;
    });
    this.ei = 0; this.phase = 0; this.nextAt = 0.001;
    this.setBiq(this.bpItb, 'bp', c.itbHz, 3);
    this.cylMul = ev.map(() => 1 + 0.07 * this.gauss());
  }

  setState(s) { for (const k in s) this.st[k] = s[k]; }

  event(e) {
    const sr = this.sr;
    if (e.type === 'bov') {
      const f = this.biq();
      this.oneShots.push({ kind: e.flutter ? 'flutter' : 'bov', age: 0, dur: Math.floor(sr * (e.flutter ? 0.75 : 0.55)), amp: Math.min(1, e.amt), f, f2: this.biq() });
    } else if (e.type === 'explode') {
      const f = this.biq(); this.setBiq(f, 'lp', 700, 0.8);
      this.oneShots.push({ kind: 'boom', age: 0, dur: Math.floor(sr * 2.6), amp: 1, f, f2: this.biq(), p: [0, 0, 0, 0, 0] });
      this.setBiq(this.oneShots[this.oneShots.length - 1].f2, 'bp', 2400, 1.2);
    } else if (e.type === 'pop') {
      this.firePop(Math.floor(this.rand() * this.banks.length), e.amt || 1, 0);
    } else if (e.type === 'popTest') {
      // one big bang, then a trailing burble of smaller pops
      const nb = this.banks.length, sch = [[0, 1.0], [0.21, 0.35], [0.29, 0.5], [0.34, 0.25], [0.52, 0.8], [0.66, 0.3], [0.71, 0.4], [0.93, 0.3]];
      sch.forEach(([tt, sz], i) => this.firePop(i % nb, sz, Math.floor(sr * tt)));
    } else if (e.type === 'shift') {
      const f = this.biq(); this.setBiq(f, 'bp', 1800, 2);
      this.oneShots.push({ kind: 'clunk', age: 0, dur: Math.floor(sr * 0.06), amp: e.amt || 0.4, f });
    }
  }

  /* A single exhaust pop / bang.
     Unburnt fuel lighting off in a hot header is mostly NOISE, not a tone:
       - a shock "N-wave" (sharp positive edge, negative undershoot) — the snap
       - a crack of broadband turbulence that dies in about a millisecond
       - a rush of expanding gas, low-passed by the pipe (non-tonal rumble)
       - a little pipe ring (very short, low-Q tone) for weight
       - often a few tiny secondary ignitions right after (crackle)
     How much of each is set by the pop style (c.pop) and the exhaust type. */
  firePop(b, size, delaySamples, noSub) {
    const c = this.cfg, sr = this.sr, P = c.pop;
    const bank = this.banks[b];
    if (!bank || this.pops.length > 64) return;
    const big = size > 0.7;
    const d0 = (delaySamples || 0) + Math.floor(this.rand() * sr * 0.002);
    this.pops.push({
      age: -d0, amp: size * P.gain, pan: bank.pan,
      nw: Math.max(2, Math.floor(sr * P.nw * (big ? 1.4 : 1) * (0.8 + 0.4 * this.rand()))),
      tc: P.tc * (0.7 + 0.6 * this.rand()) * (big ? 1.4 : 1),
      tr: P.tr * (0.7 + 0.6 * this.rand()) * (big ? 1.3 : 0.85),
      tb: P.tb * (0.8 + 0.4 * this.rand()),
      fb: c.popBodyHz * P.bodyMul * (0.85 + 0.3 * this.rand()) * (big ? 0.88 : 1.08),
      ph: 0, prevN: 0, lp: 0, lp2: 0, r1: 0, r2: 0,
      fc: Math.min(P.fc, c.popCrackHz * P.fc / 6000) * (0.75 + 0.5 * this.rand()),
      fr: P.fr * (0.8 + 0.4 * this.rand()) * (big ? 0.8 : 1.1),
    });
    // secondary ignitions: the crackle that trails a pop
    if (!noSub && P.sub[1] > 0) {
      const k = P.sub[0] + Math.floor(this.rand() * (P.sub[1] - P.sub[0] + 1));
      let at = d0;
      for (let i = 0; i < k; i++) {
        at += Math.floor(sr * (P.subGap[0] + (P.subGap[1] - P.subGap[0]) * this.rand()) / 1000);
        this.firePop(b, size * (0.18 + 0.4 * this.rand()) * Math.pow(0.8, i), at, true);
      }
    }
    // excite the real exhaust model so the pipe/muffler ring too
    if (bank.pulses.length < 48) bank.pulses.push({ age: -d0, dur: Math.floor(sr * (0.002 + 0.004 * size)), amp: P.pipe * size, noise: 0.9, pop: true });
    this.popFlash = 1;
  }

  renderPops() {
    const sr = this.sr, c = this.cfg, P = c.pop;
    let l = 0, r = 0;
    for (let j = this.pops.length - 1; j >= 0; j--) {
      const p = this.pops[j];
      p.age++;
      if (p.age < 0) continue;
      const t = p.age / sr;
      if (t > Math.max(p.tr, p.tb) * 7 + 0.005) { this.pops.splice(j, 1); continue; }
      const n = this.nz();
      // shock N-wave
      let v = 0;
      if (p.age < p.nw) { const u = p.age / p.nw; v += (u < 0.12 ? u / 0.12 : 1 - 2 * (u - 0.12) / 0.88) * P.nA; }
      // crack: differentiated noise, low-passed by how open the exhaust is
      const d = (n - p.prevN) * 0.5; p.prevN = n;
      const a = Math.exp(-2 * Math.PI * p.fc / sr);
      p.lp = p.lp * a + d * (1 - a); p.lp2 = p.lp2 * a + p.lp * (1 - a);
      v += p.lp2 * Math.exp(-t / p.tc) * 14 * P.crack * c.popCrack;
      // gas rush: 2-pole low-passed noise (the non-tonal "boom")
      const ar = Math.exp(-2 * Math.PI * p.fr / sr);
      p.r1 = p.r1 * ar + n * (1 - ar); p.r2 = p.r2 * ar + p.r1 * (1 - ar);
      const att = 1 - Math.exp(-t / 0.0004);
      v += p.r2 * att * Math.exp(-t / p.tr) * 9 * P.rumble;
      // short pipe ring
      if (P.body > 0) {
        p.ph += 2 * Math.PI * p.fb * (1 - 0.15 * Math.min(1, t / (p.tb * 2))) / sr;
        v += Math.sin(p.ph) * att * Math.exp(-t / p.tb) * P.body;
      }
      v *= p.amp;
      const pl = 0.5 - p.pan * 0.5, pr = 0.5 + p.pan * 0.5;
      l += v * pl * 2; r += v * pr * 2;
    }
    const k = P.drive;
    const nk = 0.75 * c.popGain / Math.tanh(k);
    l = Math.tanh(l * k) * nk; r = Math.tanh(r * k) * nk;
    // slap-back echo off nearby walls (adds a lot of realism to bangs)
    const eb = this.popEcho, el = eb.length, ed = Math.floor(sr * P.echoMs / 1000);
    const e = eb[(this.popEi - ed + el) % el];
    eb[this.popEi] = (l + r) * 0.5; this.popEi = (this.popEi + 1) % el;
    return [l + e * P.echo, r + e * P.echo * 0.9];
  }

  fire(e, idx) {
    const c = this.cfg, st = this.st, sr = this.sr;
    const bank = this.banks[e.bank];
    if (!bank) return;
    const rpm = Math.max(60, this.rpmS);
    const overrun = this.thrS < 0.06 && rpm > c.idle * 1.6 && st.running;
    let amp, noise = c.pulseNoise;
    const combust = st.running && !st.cut && !st.crank;
    if (combust) {
      const load = this.loadS;
      amp = e.amp * this.cylMul[idx] * ((overrun ? 0.085 : 0.2) + 0.8 * load) * (0.62 + 0.38 * Math.min(1.3, rpm / c.redline));
      amp *= 1 + 0.07 * this.gauss();
      // big-cam lope at idle: erratic combustion
      const lope = c.lope * Math.max(0, 1 - rpm / (c.idle * 2.6));
      if (lope > 0) {
        amp *= 1 - lope * 0.75 * this.rand();
        if (this.rand() < lope * 0.12) amp *= 0.2;
      }
      if (c.rotary && rpm < 2600 && load < 0.3 && this.rand() < 0.22) amp *= 0.25 + 0.4 * this.rand(); // rotary brap
      noise *= 0.6 + 0.6 * load;
    } else {
      amp = e.amp * 0.07 * (st.crank ? 1.4 : 1);
      noise *= 0.4;
    }
    // pops & bangs: fuel left in the exhaust on overrun / limiter cut
    if (st.running && c.popRate > 0 && this.popCool <= 0) {
      const rpmF = Math.min(1, Math.max(0, (rpm - 1700) / 2800));
      // popRate is a target rate in pops/second; convert to a per-firing-event chance
      const evPerSec = Math.max(1, rpm / 120 * c.events.length * 720 / c.cycle);
      let hz = 0;
      if (overrun) hz = c.popRate * (c.als ? 1 : this.overrun) * rpmF * (this.popStreak > 0 ? 3.2 : 1);
      if (st.cut) hz = Math.max(hz, c.popRate * 1.6);
      const p = hz / evPerSec;
      if (p > 0 && this.rand() < p) {
        const bigP = st.cut ? c.bigBang * 1.5 : c.bigBang;
        const size = this.rand() < bigP ? 0.75 + 0.35 * this.rand() : 0.2 + 0.4 * this.rand() * (0.5 + 0.5 * rpmF);
        const delay = Math.floor(sr * ((e.delayMs || 0) / 1000 + 0.0015 + 0.002 * this.rand()));
        this.firePop(e.bank, size, delay);
        this.popStreak = 1 + Math.floor(this.rand() * 4);
        this.popCool = Math.floor(sr * 0.004);
      } else if (this.popStreak > 0) this.popStreak--;
    }
    let widthDeg = c.widthDeg * (1 - 0.18 * this.loadS);
    const dur = Math.max(12, Math.min(sr * 0.06, Math.floor(sr * widthDeg / (rpm * 6))));
    const delay = Math.floor(sr * (e.delayMs || 0) / 1000);
    if (bank.pulses.length < 48) bank.pulses.push({ age: -delay, dur, amp, noise, pop: false });
    // valvetrain ticks
    if (st.running && this.mech.length < 24) this.mech.push({ age: 0, dur: Math.floor(sr * 0.0007), amp: c.tick * (0.5 + 0.5 * this.rand()) });
  }

  process(L, R, n) {
    const c = this.cfg;
    if (!c) { for (let i = 0; i < n; i++) { L[i] = 0; R[i] = 0; } return; }
    const st = this.st, sr = this.sr;
    const k = 1 - Math.exp(-1 / (sr * 0.018));
    const kf = 1 - Math.exp(-1 / (sr * 0.012));
    const mic = st.mic;
    const mExh = mic === 'cabin' ? 0.55 : mic === 'bay' ? 0.35 : 1;
    const mInt = mic === 'cabin' ? 0.5 : mic === 'bay' ? 1.3 : 0.22;
    const mMech = mic === 'cabin' ? 0.15 : mic === 'bay' ? 1 : 0.12;
    const mWhine = mic === 'cabin' ? 0.6 : mic === 'bay' ? 1.4 : 0.5;
    // turbo / supercharger / BOV level relative to the engine (a touch quieter from the exhaust)
    const mBoost = mic === 'cabin' ? 0.6 : mic === 'bay' ? 1.4 : 0.36;
    const roomWet = st.room;
    const vol = st.volume;
    // update intake filter occasionally
    this.coefT -= n;
    if (this.coefT <= 0) {
      this.coefT = 256;
      const r = Math.max(300, this.rpmS);
      this.setBiq(this.bpI, 'bp', 260 + r * 0.035, 1.3);
      const tf = (3200 + 6500 * Math.pow(Math.max(0, this.boostS), 0.7)) * c.turboPitch;
      this.setBiq(this.bpT, 'bp', tf * 0.45, 0.9);
      this.setBiq(this.bpB, 'bp', 2600, 0.7);
    }
    // overrun burble window: armed on throttle, triggered on lift, fades out
    if (c.popRate > 0) {
      if (this.thrS > 0.45 && this.rpmS > 2500) this.liftArmed = true;
      if (this.liftArmed && this.thrS < 0.1 && st.running) {
        this.liftArmed = false;
        this.overrun = 1;
        if (this.rpmS > 3000 && this.rand() < c.bigBang * 2.5) this.firePop(Math.floor(this.rand() * this.banks.length), 0.9 + 0.2 * this.rand(), Math.floor(sr * 0.03));
      }
      this.overrun *= Math.exp(-n / (sr * c.burbleS));
      if (this.thrS > 0.3) this.overrun = 0;
    }
    for (let i = 0; i < n; i++) {
      this.rpmS += (st.rpm - this.rpmS) * kf;
      this.thrS += (st.throttle - this.thrS) * k;
      this.loadS += (st.load - this.loadS) * k;
      this.boostS += (st.boost - this.boostS) * k;
      this.kersS += (st.kers - this.kersS) * k;
      this.ekS += (st.ek - this.ekS) * k;
      this.skidS += (st.skid - this.skidS) * k;
      this.gearFS += (st.gearF - this.gearFS) * kf;
      this.gearAS += (st.gearA - this.gearAS) * k;
      if (this.popCool > 0) this.popCool--;

      // idle lope rpm wobble
      let rpmEff = this.rpmS;
      if (c.lope > 0 && st.running) {
        this.lopeT -= 1;
        if (this.lopeT <= 0) { this.lopeT = Math.floor(sr * (0.08 + 0.12 * this.rand())); this.lopeV = this.gauss(); }
        const fade = Math.max(0, 1 - this.rpmS / (c.idle * 2.2));
        rpmEff *= 1 + this.lopeV * 0.05 * c.lope * fade;
      }
      const dPh = rpmEff * 6 / sr * c.speedMul;
      this.phase += dPh;
      let guard = 0;
      while (this.phase >= this.nextAt && guard++ < 8 && rpmEff > 20) {
        this.fire(c.events[this.ei], this.ei);
        this.nextAt += this.gaps[this.ei];
        this.ei = (this.ei + 1) % c.events.length;
      }
      if (this.phase > 1e6) { this.phase -= 720000; this.nextAt -= 720000; }
      if (rpmEff <= 20) { this.nextAt = this.phase + 1; }

      // ---- exhaust banks ----
      let outL = 0, outR = 0, raw = 0;
      const flow = Math.min(1.5, this.rpmS / c.redline) * (0.25 + 0.75 * this.loadS);
      for (let b = 0; b < this.banks.length; b++) {
        const bank = this.banks[b];
        let x = 0;
        const ps = bank.pulses;
        for (let j = ps.length - 1; j >= 0; j--) {
          const p = ps[j];
          p.age++;
          if (p.age < 0) continue;
          const u = p.age / p.dur;
          if (u >= 1) { ps.splice(j, 1); continue; }
          const om = 1 - u;
          let s = om * om * (1 - Math.exp(-u * (p.pop ? 80 : 28)));
          x += p.amp * s * (1 + p.noise * this.nz());
        }
        raw += x;
        // header waveguide (open-end inverting reflection, lossy)
        const hb = bank.hbuf, hl = hb.length;
        const dly = hb[(bank.hi - bank.hd + hl) % hl];
        bank.hlp += (dly - bank.hlp) * 0.45;
        let y = x - c.headerG * bank.hlp;
        hb[bank.hi] = y; bank.hi = (bank.hi + 1) % hl;
        // tailpipe resonance
        const tb = bank.tbuf, tl = tb.length;
        const td = tb[(bank.ti - bank.td + tl) % tl];
        bank.tlp += (td - bank.tlp) * 0.3;
        let z = y + c.tailG * bank.tlp;
        tb[bank.ti] = z; bank.ti = (bank.ti + 1) % tl;
        // muffler + body
        z = this.bq(bank.lp1, z);
        z = this.bq(bank.lp2, z);
        z = this.bq(bank.body, z);
        z = this.bq(bank.body2, z);
        // flow hiss
        z += this.bq(bank.hiss, this.nz()) * c.hiss * flow;
        // rasp
        z = Math.tanh(z * c.rasp) / c.rasp;
        const pl = 0.5 - bank.pan * 0.5, pr = 0.5 + bank.pan * 0.5;
        outL += z * pl * 2; outR += z * pr * 2;
      }
      outL *= c.exhGain * mExh; outR *= c.exhGain * mExh;
      if (this.pops.length || this.popTail > 0) {
        if (this.pops.length) this.popTail = Math.floor(sr * 0.15); else this.popTail--;
        const pp = this.renderPops(); outL += pp[0] * mExh; outR += pp[1] * mExh;
      }
      if (mic === 'bay') { outL = this.bq(this.lpBay, outL); outR = this.bq(this.lpBayR, outR); }

      // ---- intake ----
      const ar = raw < 0 ? -raw : raw;
      this.intEnv += (ar - this.intEnv) * 0.02;
      const thrA = 0.15 + 0.85 * this.thrS;
      let intake = this.bq(this.bpI, this.nz()) * this.intEnv * c.intakeAmt * thrA * 1.4;
      intake += this.bq(this.bpItb, raw) * c.itbAmt * thrA;
      intake *= mInt;

      // ---- mechanical ticks ----
      let mech = 0;
      for (let j = this.mech.length - 1; j >= 0; j--) {
        const m = this.mech[j]; m.age++;
        if (m.age >= m.dur) { this.mech.splice(j, 1); continue; }
        mech += m.amp * this.nz() * (1 - m.age / m.dur);
      }
      mech = this.bq(this.hpMech, mech) * mMech;
      if (st.running || this.rpmS > 50) mech += Math.sin(this.stPh) * 0.004 * mMech * Math.min(1, this.rpmS / 3000);

      // ---- turbo ----
      let whine = 0, boostDev = 0;
      if (c.turbo) {
        const bs = Math.max(0, this.boostS);
        const tf = (3200 + 6500 * Math.pow(bs, 0.7)) * c.turboPitch;
        this.tPh += 2 * Math.PI * tf / sr; if (this.tPh > 6.283) this.tPh -= 6.283;
        this.tPh2 += 2 * Math.PI * tf * 1.013 / sr; if (this.tPh2 > 6.283) this.tPh2 -= 6.283;
        const ta = 0.022 * bs * (0.3 + 0.7 * this.thrS);
        boostDev += (Math.sin(this.tPh) + (c.turboCount > 1 ? 0.7 * Math.sin(this.tPh2) : 0)) * ta;
        boostDev += this.bq(this.bpT, this.nz()) * 0.1 * bs * (0.2 + 0.8 * this.thrS);
      }
      // ---- supercharger ----
      if (c.sc) {
        const f = this.rpmS / 60 * c.scMul;
        this.scPh += 2 * Math.PI * f / sr; if (this.scPh > 6.283) this.scPh -= 6.283;
        const a = 0.03 * Math.min(1.2, this.rpmS / c.redline) * (0.35 + 0.65 * this.thrS) * c.scAmt;
        let s = Math.sin(this.scPh) + 0.45 * Math.sin(2 * this.scPh) + 0.2 * Math.sin(3 * this.scPh);
        if (c.scRoots) s *= 0.75 + 0.25 * Math.sin(this.scPh * 0.25);
        boostDev += s * a;
      }
      // ---- electric boosting ----
      if ((c.eturbo || c.esc) && this.ekS > 0.002) {
        const e = this.ekS;
        if (c.esc) {
          // e-supercharger: small impeller at up to ~70k rpm -> high, clean whine + motor tone
          const f = 2600 + 6200 * e;
          this.ePh += 2 * Math.PI * f / sr; if (this.ePh > 6.283) this.ePh -= 6.283;
          this.ePh2 += 2 * Math.PI * f * 0.25 / sr; if (this.ePh2 > 6.283) this.ePh2 -= 6.283;
          boostDev += (Math.sin(this.ePh) * 0.8 + Math.sin(this.ePh2) * 0.35) * 0.03 * e;
        }
        if (c.eturbo) {
          // e-turbo: motor on the turbo shaft -> sci-fi rising whine with a hint of inverter buzz
          const f = 1500 + 4600 * e;
          this.ePh += 2 * Math.PI * f / sr; if (this.ePh > 6.283) this.ePh -= 6.283;
          const sq = Math.sin(this.ePh) + 0.33 * Math.sin(3 * this.ePh) + 0.15 * Math.sin(5 * this.ePh);
          boostDev += sq * 0.022 * e;
        }
      }
      // ---- tyre screech (lock-ups, wheelspin, ABS chatter) ----
      if (this.skidS > 0.003) {
        if (!this.bpSkid) { this.bpSkid = this.biq(); this.setBiq(this.bpSkid, 'bp', 1150, 5); }
        this.skPh += 2 * Math.PI * (7 + 4 * Math.sin(this.t * 2e-5)) / sr;
        const wob = 0.65 + 0.35 * Math.sin(this.skPh);
        whine += this.bq(this.bpSkid, this.nz()) * 0.55 * this.skidS * wob;
      }
      // ---- MGU-K ----
      if (this.kersS > 0.002) {
        const f = this.rpmS / 60 * 9.5 + 120;
        this.kPh += 2 * Math.PI * f / sr; if (this.kPh > 6.283) this.kPh -= 6.283;
        whine += (Math.sin(this.kPh) + 0.5 * Math.sin(2 * this.kPh + 0.3) + 0.25 * Math.sin(3.02 * this.kPh)) * 0.03 * this.kersS;
      }
      // ---- gear whine ----
      if (this.gearAS > 0.001) {
        this.gPh += 2 * Math.PI * this.gearFS / sr; if (this.gPh > 6.283) this.gPh -= 6.283;
        whine += (Math.sin(this.gPh) + 0.4 * Math.sin(2 * this.gPh)) * 0.03 * this.gearAS;
      }
      // starter motor
      if (st.crank) {
        this.stPh += 2 * Math.PI * 105 / sr; if (this.stPh > 6.283) this.stPh -= 6.283;
        whine += ((this.stPh / Math.PI - 1) * 0.06 + this.nz() * 0.01) * (0.8 + 0.2 * Math.sin(this.t * 2 * Math.PI * 9 / sr));
      } else {
        this.stPh += 2 * Math.PI * Math.max(1, this.rpmS / 60) / sr; if (this.stPh > 6.283) this.stPh -= 6.283;
      }
      whine = whine * mWhine + boostDev * mBoost;

      // ---- one-shots ----
      let fx = 0;
      for (let j = this.oneShots.length - 1; j >= 0; j--) {
        const o = this.oneShots[j];
        o.age++;
        if (o.age >= o.dur) { this.oneShots.splice(j, 1); continue; }
        const u = o.age / o.dur, tt = o.age / sr;
        if (o.kind === 'bov') {
          if ((o.age & 63) === 0) this.setBiq(o.f, 'bp', 3800 - 2400 * u, 0.9);
          const env = Math.min(1, tt / 0.004) * Math.exp(-tt / 0.16);
          fx += this.bq(o.f, this.nz()) * env * 0.5 * o.amp * mBoost;
        } else if (o.kind === 'flutter') {
          if ((o.age & 63) === 0) this.setBiq(o.f, 'bp', 1100 - 400 * u, 1.4);
          const rate = 26 - 14 * u;
          const am = Math.pow(Math.max(0, Math.sin(2 * Math.PI * rate * tt)), 3);
          fx += this.bq(o.f, this.nz()) * am * (1 - u) * 0.9 * o.amp * mBoost;
        } else if (o.kind === 'boom') {
          const env = Math.min(1, tt / 0.002) * Math.exp(-tt / 0.22);
          let s = this.bq(o.f, this.nz()) * env * 3.2;
          const parts = [523, 1347, 2213, 3170, 4410];
          for (let q = 0; q < 5; q++) { o.p[q] += 2 * Math.PI * parts[q] / sr; s += Math.sin(o.p[q]) * Math.exp(-tt / (0.12 + q * 0.05)) * 0.12; }
          // falling debris clanks
          if (tt > 0.25 && this.rand() < 0.0009 * (1 - u)) s += this.bq(o.f2, this.nz() * 30) * 0.04;
          s += this.bq(o.f2, this.nz()) * Math.exp(-tt / 0.6) * 0.25;
          fx += s;
        } else if (o.kind === 'clunk') {
          fx += this.bq(o.f, this.nz()) * (1 - u) * o.amp * 0.5;
        }
      }

      let mono = intake + mech + whine + fx;
      if (mic === 'cabin') {
        outL = this.bq(this.lpCab, outL) * 1.6; outR = this.bq(this.lpCabR, outR) * 1.6;
        mono *= 0.8;
      }
      let l = outL + mono, r = outR + mono;
      // ground reflection
      const gd = Math.floor(sr * 0.0062);
      const gb = this.ground, gl = gb.length;
      const gm = (l + r) * 0.5;
      const refl = gb[(this.gi - gd + gl) % gl];
      gb[this.gi] = gm; this.gi = (this.gi + 1) % gl;
      l += refl * 0.22; r += refl * 0.22;
      // room reverb
      if (roomWet > 0.001) {
        const inp = (l + r) * 0.08;
        let acc = 0;
        for (let q = 0; q < this.combs.length; q++) {
          const cb = this.combs[q];
          const o = cb.buf[cb.i];
          cb.lp = o * 0.62 + cb.lp * 0.38;
          cb.buf[cb.i] = inp + cb.lp * 0.8;
          cb.i = (cb.i + 1) % cb.buf.length;
          acc += o;
        }
        for (let q = 0; q < this.aps.length; q++) {
          const ap = this.aps[q];
          const b = ap.buf[ap.i];
          const o = -acc + b;
          ap.buf[ap.i] = acc + b * 0.5;
          ap.i = (ap.i + 1) % ap.buf.length;
          acc = o;
        }
        l += acc * roomWet; r += acc * roomWet * 0.96;
      }
      // DC block
      const dl = l - this.dcL.x + 0.997 * this.dcL.y; this.dcL.x = l; this.dcL.y = dl;
      const dr = r - this.dcR.x + 0.997 * this.dcR.y; this.dcR.x = r; this.dcR.y = dr;
      L[i] = Math.tanh(dl * 0.9 * vol) * 0.92;
      R[i] = Math.tanh(dr * 0.9 * vol) * 0.92;
      this.t++;
    }
  }
}


class EngineSynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super(); this.s = new EngineSynth(sampleRate);
    this.port.onmessage = (e) => { const m = e.data;
      if (m.t === 'cfg') this.s.setConfig(m.v); else if (m.t === 'st') this.s.setState(m.v); else if (m.t === 'ev') this.s.event(m.v); };
  }
  process(i, o) { const out = o[0]; this.s.process(out[0], out[1] || out[0], out[0].length); return true; }
}
registerProcessor('engine-synth', EngineSynthProcessor);
