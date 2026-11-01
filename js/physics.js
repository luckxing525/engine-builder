/* =====================================================================
   TORQUESMITH — engine physics model
   A 0-D mean-value engine model: volumetric efficiency, charge density,
   indicated efficiency, friction, knock control, boost devices, fueling,
   hybrid assist and a stress/reliability model. Everything is computed
   per-rpm from the build config so curves "emerge" from the parts.
   ===================================================================== */
(function (root) {
  'use strict';

  const T_AMB = 298;          // K (25 C)
  const P_AMB = 101325;       // Pa
  const R_AIR = 287;
  const RHO_AMB = P_AMB / (R_AIR * T_AMB);
  const CP = 1005;
  const PSI = 6894.76;
  const HP = 745.7;
  const LBFT = 1.35582;

  const FUELS = {
    p87:  { name: 'Regular 87',   octane: 87,  energy: 2.95e6, cool: 1.00, evap: 0.02, stoich: 14.7, dens: 0.745, lhv: 43.4e6, cost: 0 },
    p91:  { name: 'Premium 91',   octane: 91,  energy: 2.95e6, cool: 1.00, evap: 0.02, stoich: 14.7, dens: 0.745, lhv: 43.4e6, cost: 0 },
    p93:  { name: 'Premium 93',   octane: 93,  energy: 2.96e6, cool: 1.00, evap: 0.02, stoich: 14.7, dens: 0.745, lhv: 43.4e6, cost: 0 },
    race: { name: 'Race Gas 104', octane: 104, energy: 2.98e6, cool: 1.0, evap: 0.04, stoich: 14.4, dens: 0.72, lhv: 43.0e6, cost: 400 },
    e85:  { name: 'E85 Ethanol',  octane: 106, energy: 2.98e6, cool: 1.0, evap: 0.16, stoich: 9.8,  dens: 0.78, lhv: 29.2e6, cost: 900 },
    meth: { name: 'Methanol',     octane: 118, energy: 3.08e6, cool: 1.0, evap: 0.38, stoich: 6.45, dens: 0.79, lhv: 19.9e6, cost: 2600 },
  };

  const VALVETRAIN = {
    OHV:  { name: 'OHV Pushrod 2V', ve: 0.90, vp: -1.5, float: 7600, fmep: 0.04, eff: 0.975, knock: 1.5, cost: 0 },
    SOHC: { name: 'SOHC 2V',        ve: 0.91, vp: -0.6, float: 8400, fmep: 0.02, eff: 0.985, knock: 0.8, cost: 500 },
    DOHC: { name: 'DOHC 4V',        ve: 0.98, vp: 0.5,  float: 9800, fmep: 0.0,  eff: 1.0,   knock: 0,   cost: 1500 },
    PNEU: { name: 'DOHC Pneumatic', ve: 1.02, vp: 3.0,  float: 21000, fmep: -0.06, eff: 1.01, knock: -0.5, cost: 45000 },
  };
  const SPRINGS = { stock: { mul: 1.0, cost: 0 }, uprated: { mul: 1.12, cost: 700 }, race: { mul: 1.3, cost: 2800 } };
  const INTERNALS = {
    cast:   { name: 'Cast',        vp: 20.5, bmep: 17,  nos: 14, cost: 0 },
    hyper:  { name: 'Hypereutectic', vp: 21.5, bmep: 21, nos: 20, cost: 700 },
    forged: { name: 'Forged',      vp: 24.5, bmep: 30,  nos: 50, cost: 3200 },
    billet: { name: 'Billet',      vp: 27.5, bmep: 44,  nos: 90, cost: 14000 },
  };
  const INTAKES = {
    stock: { restr: 0.02, ve: 0,    vp: 0,   cost: 0 },
    cai:   { restr: 0.01, ve: 0.01, vp: 0.2, cost: 350 },
    itb:   { restr: 0.005, ve: 0.035, vp: 1.0, cost: 3800 },
  };
  const EXHAUSTS = {
    stock:    { restr: 0.032,  cost: 0 },
    sport:    { restr: 0.018,  cost: 1200 },
    header:   { restr: 0.009, cost: 2400 },
    straight: { restr: 0.004, cost: 700 },
  };
  const ASPIRATION = {
    na: 'Naturally Aspirated', turbo: 'Turbocharged', sc_roots: 'Roots Supercharger',
    sc_screw: 'Twin-Screw Supercharger', sc_centri: 'Centrifugal Supercharger', twin: 'Twincharged (SC + Turbo)',
    esc: 'Electric Supercharger', esc_turbo: 'E-Supercharger + Turbo (series)',
  };
  const TIRES = {
    street: { name: 'Street', mu: 1.0, cost: 0 }, perf: { name: 'Performance', mu: 1.15, cost: 0 },
    semi: { name: 'Semi-slick', mu: 1.35, cost: 0 }, radial: { name: 'Drag radial', mu: 1.8, cost: 0 },
    slick: { name: 'Drag slick', mu: 2.2, cost: 0 },
  };

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  /* ------------------------------------------------------------------ */
  function geometry(cfg) {
    const rot = cfg.layout === 'R';
    let dispL, cylVolL, n;
    if (rot) {
      n = cfg.cyl; dispL = n * cfg.rotorCC / 1000; cylVolL = cfg.rotorCC / 1000;
    } else {
      n = cfg.cyl;
      cylVolL = Math.PI / 4 * (cfg.bore / 10) ** 2 * (cfg.stroke / 10) / 1000;
      dispL = cylVolL * n;
    }
    return { rot, n, dispL, cylVolL, D: dispL / 1000 };
  }

  function pistonSpeed(cfg, rpm) {
    if (cfg.layout === 'R') return rpm / 1000 * 1.7;  // equivalent rubbing speed
    return 2 * (cfg.stroke / 1000) * rpm / 60;
  }

  function veTune(cfg) {
    const c = cfg.cam / 100;
    const vt = VALVETRAIN[cfg.valvetrain];
    const it = INTAKES[cfg.intake];
    const runner = (cfg.runner - 50) / 50;      // -1 short .. +1 long
    if (cfg.layout === 'R') {
      return {
        c, peak: 0.86 + 0.13 * c + it.ve, rpmPeak: (5200 + 3600 * c) * (1 - 0.06 * runner),
        sLow: 0.55 - 0.2 * c, sHigh: 0.42,
      };
    }
    const vpPeak = 12 + 6.2 * c - 1.8 * runner + vt.vp + it.vp;
    const rpmPeak = vpPeak * 60 / (2 * cfg.stroke / 1000);
    let sLow = 0.6 - 0.26 * c + 0.06 * runner, sHigh = 0.5 + 0.04 * (1 - c);
    if (cfg.vvt === 'intake') { sLow += 0.12; sHigh += 0.04; }
    if (cfg.vvt === 'dual') { sLow += 0.2; sHigh += 0.07; }
    if (cfg.vvt === 'lift') { sLow += 0.2; sHigh += 0.07; }
    return { c, peak: vt.ve + 0.085 * c + it.ve, rpmPeak, sLow, sHigh };
  }

  function veGauss(t, rpm) {
    const x = Math.log(rpm / t.rpmPeak);
    const s = x < 0 ? t.sLow : t.sHigh;
    const floor = 0.5;
    return t.peak * (floor + (1 - floor) * Math.exp(-(x * x) / (2 * s * s)));
  }

  function valveFloat(cfg) {
    if (cfg.layout === 'R') return 99999;
    const vt = VALVETRAIN[cfg.valvetrain];
    return vt.float * Math.pow(86 / cfg.bore, 0.8) * SPRINGS[cfg.springs].mul;
  }

  function baseVE(cfg, rpm) {
    const t = veTune(cfg);
    let ve = veGauss(t, rpm);
    if (cfg.vvt === 'lift' && cfg.layout !== 'R') {
      // switch between a mild and a wild cam lobe (whichever breathes better)
      const mild = Object.assign({}, t, { peak: t.peak - 0.04, rpmPeak: t.rpmPeak * 0.72, sLow: t.sLow + 0.1 });
      const wild = Object.assign({}, t, { peak: t.peak + 0.035, rpmPeak: t.rpmPeak * 1.1, sLow: t.sLow - 0.1 });
      ve = Math.max(veGauss(mild, rpm), veGauss(wild, rpm));
    }
    // valve float: VE collapses past float rpm
    const fl = valveFloat(cfg);
    ve *= 1 / (1 + Math.exp((rpm - fl) / (0.03 * fl)));
    // big overlap cams hate low rpm (reversion)
    ve *= 1 - 0.12 * t.c * t.c * Math.exp(-rpm / 1600);
    return ve;
  }

  const isTurbo = (cfg) => cfg.aspiration === 'turbo' || cfg.aspiration === 'twin' || cfg.aspiration === 'esc_turbo';
  const hasElec = (cfg) => cfg.aspiration === 'esc' || cfg.aspiration === 'esc_turbo' || (cfg.eturbo && (cfg.aspiration === 'turbo' || cfg.aspiration === 'esc_turbo'));

  /* compressor models -------------------------------------------------- */
  function turboCapacity(cfg) {
    // kg/s total compressor flow capacity
    const lbmin = 0.0175 * cfg.turboSize * cfg.turboSize;
    return lbmin * 0.00756 * cfg.turboCount;
  }

  /* Main point solver --------------------------------------------------- */
  function solvePoint(cfg, rpm, opt) {
    opt = opt || {};
    const g = geometry(cfg);
    const fuel = FUELS[cfg.fuel];
    const vt = VALVETRAIN[cfg.valvetrain];
    const bf = opt.boostFrac == null ? 1 : opt.boostFrac;       // transient boost multiplier
    const naOnly = !!opt.naOnly;
    const strokes = g.rot ? 60 : 120;                           // rpm divisor for cycles/s
    const ve0 = baseVE(cfg, rpm);
    const flowNA = g.D * rpm / strokes * RHO_AMB * ve0;         // kg/s at PR=1
    const tune = veTune(cfg);
    const flowRef = g.D * tune.rpmPeak / strokes * RHO_AMB * tune.peak;

    // ---- boost ----
    const asp = cfg.aspiration;
    const target = 1 + cfg.boost * PSI / P_AMB;
    const elecOK = !naOnly && opt.noElec !== true;
    let PR = 1, etaC = 0.72, scDrive = false, scEta = 0.7, turboPR = 1, scPR = 1, flowRatio = 0;
    let cap = 0, spool = 0, spoolRaw = 0;
    const hasTurbo = isTurbo(cfg);
    const hasSC = asp === 'sc_roots' || asp === 'sc_screw' || asp === 'sc_centri' || asp === 'twin';
    const hasESC = asp === 'esc' || asp === 'esc_turbo';
    const eTurboW = hasTurbo && asp !== 'twin' && cfg.eturbo ? cfg.eturboKw * 1000 : 0;
    const ic = { none: 0, air: 0.75, water: 0.86 }[cfg.intercooler];
    const tIn = T_AMB + (g.rot ? 14 : 8);
    const restr = INTAKES[cfg.intake].restr + EXHAUSTS[cfg.exhaust].restr;
    // charge-air state for a given manifold pressure ratio
    const chargeAt = (prx, eta) => {
      const T2 = T_AMB * (1 + (Math.pow(prx, 0.2857) - 1) / eta);
      const Tc = T2 - ic * (T2 - T_AMB);
      let tch = Math.max(tIn, Tc + (tIn - T_AMB));
      tch -= fuel.evap * (tch - 270);
      const PRm = Math.max(1, prx - (ic > 0 ? 0.035 * (prx - 1) : 0));
      const rh = P_AMB * PRm / (R_AIR * tch) * fuel.cool;
      let m = g.D * rpm / strokes * rh * ve0;
      const q = m / Math.max(1e-6, flowRef);
      const v = Math.max(0.2, ve0 * (1 - Math.min(0.3, restr * q * q)));
      m = g.D * rpm / strokes * rh * v;
      return { Tch: tch, rho: rh, ve: v, mdot: m };
    };
    // isentropic compressor work (W) to push mass flow m through pressure ratio pr
    const compW = (m, pr, eta) => pr <= 1 ? 0 : m * CP * T_AMB * (Math.pow(pr, 0.2857) - 1) / eta;
    // largest pr in [lo, hi] whose compressor work stays within budget W
    const solvePR = (lo, hi, W, workAt) => {
      if (workAt(hi) <= W) return hi;
      if (workAt(lo) > W) return lo;
      for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (workAt(mid) <= W) lo = mid; else hi = mid; }
      return lo;
    };
    let eDraw = 0, eHarvest = 0, escPR = 1, turbShare = 1, exhPR = 1;
    if (!naOnly && hasTurbo) {
      cap = turboCapacity(cfg);
      const arK = { small: 0.13, med: 0.16, large: 0.2 }[cfg.turbineAR] * (cfg.antilag ? 0.82 : 1);
      spoolRaw = flowNA / (cap * arK);
      spool = Math.pow(smooth(0.42, 1.0, spoolRaw), 1.15);
      turboPR = 1 + (target - 1) * spool;
      exhPR = turboPR;
      // E-TURBO: a motor on the turbo shaft adds its power to the exhaust's.
      // Boost becomes whatever the combined shaft power can compress.
      if (eTurboW > 0 && elecOK) {
        const Wx = compW(chargeAt(turboPR, 0.72).mdot, turboPR, 0.72);
        const work = (pr) => compW(chargeAt(pr, 0.72).mdot, pr, 0.72);
        const pr = solvePR(turboPR, target, Wx + eTurboW * 0.92, work);
        if (pr > turboPR + 1e-4) {
          const Wn = work(pr);
          eDraw = (Wn - Wx) / 0.92;
          turbShare = Wx / Math.max(1, Wn);
          turboPR = pr;
        }
        // generator mode: surplus exhaust energy the wastegate would dump is harvested instead
        if (spoolRaw > 1) eHarvest = Math.min(eTurboW, compW(chargeAt(target, 0.72).mdot, target, 0.72) * (Math.min(spoolRaw, 2.5) - 1) * 0.6) * 0.9;
      }
    }
    // ELECTRIC SUPERCHARGER: motor-driven compressor, power-limited (W = P_motor)
    if (hasESC && elecOK && cfg.escKw > 0) {
      const etaE = 0.66, Pe = cfg.escKw * 1000 * 0.9;
      const prCap = asp === 'esc' ? Math.min(target, 2.1) : Math.min(2.1, target / Math.max(1, turboPR));
      if (prCap > 1.005) {
        // in series the e-supercharger sees the whole engine airflow at the final pressure
        const work = (pe) => compW(chargeAt(turboPR * pe, 0.7).mdot, pe, etaE);
        escPR = solvePR(1, prCap, Pe, work);
        if (escPR > 1.005) eDraw += work(escPR) / 0.9; else escPR = 1;
      }
    }
    if (!naOnly && hasSC) {
      if (asp === 'sc_centri') {
        const r = clamp(rpm / Math.max(3000, cfg.redline), 0, 1.15);
        scPR = 1 + (target - 1) * r * r;
        scEta = 0.72;
      } else {
        scPR = 1 + (target - 1) * smooth(700, 2200, rpm);
        scEta = asp === 'sc_roots' ? 0.56 : 0.7;
        if (asp === 'twin') scPR = 1 + (target - 1) * 0.75 * smooth(700, 2000, rpm);
      }
    }
    if (asp === 'twin') {
      // supercharger clutch disengages when turbo takes over
      if (turboPR >= scPR * 0.98) { PR = turboPR; scDrive = false; } else { PR = scPR; scDrive = true; }
    } else if (asp === 'esc_turbo') PR = turboPR * escPR;   // compressors in series multiply
    else if (asp === 'esc') PR = escPR;
    else if (hasTurbo) PR = turboPR;
    else if (hasSC) { PR = scPR; scDrive = true; }
    PR = 1 + (PR - 1) * bf;

    let Tch, rho, ve = ve0, mdot;
    for (let it = 0; it < 4; it++) {
      if (hasTurbo && !scDrive) {
        flowRatio = cap > 0 ? (g.D * rpm / strokes * RHO_AMB * PR * ve) / cap : 0;
        etaC = 0.75 - 0.5 * Math.max(0, flowRatio - 0.7) ** 2 - (flowRatio < 0.25 ? 0.05 : 0);
        etaC = clamp(etaC, 0.45, 0.76);
        if (escPR > 1.005) etaC = Math.min(etaC, 0.7);
      } else if (scDrive) etaC = scEta;
      else if (asp === 'esc') etaC = 0.66;
      const st = chargeAt(PR, etaC);
      Tch = st.Tch; rho = st.rho; ve = st.ve; mdot = st.mdot;
      // compressor choke: limit PR so flow stays inside the turbo's map
      if (hasTurbo && !scDrive && mdot > cap * 0.97) {
        PR = Math.max(1, 1 + (PR - 1) * (cap * 0.97 / mdot) ** 1.4);
      }
    }
    flowRatio = cap > 0 ? mdot / cap : 0;
    const boostPsi = (PR - 1) * P_AMB / PSI;

    // ---- fueling ----
    let lambda = cfg.lambda;
    const injCount = g.rot ? g.n * 2 : g.n;
    const fuelKgS = mdot / (lambda * fuel.stoich);
    const ccMinNeeded = fuelKgS / fuel.dens * 1000 * 60 / injCount; // cc/min/injector
    const injDuty = ccMinNeeded / (cfg.injector * 0.85);
    let leanOut = false;
    if (injDuty > 1) { lambda = lambda * injDuty; leanOut = true; }

    // ---- nitrous ----
    const nosOn = !naOnly && cfg.nitrous > 0 && (opt.nitrous !== false) && rpm >= 3000;
    const nosFrac = nosOn ? smooth(3000, 3600, rpm) : 0;

    // ---- knock ----
    const CReff = cfg.cr * Math.pow(PR, 0.45);
    const rpmTerm = clamp(-1.3 * (rpm / 1000 - 3), -6, 3);
    let onReq = 86 + 23 * Math.log(CReff / 10) + 0.12 * (Tch - 308) + (g.rot ? 0 : 0.15 * (cfg.bore - 86))
      + rpmTerm + 0.8 * cfg.timing + 20 * (lambda - 0.88) + vt.knock - 3 * tune.c
      + nosFrac * cfg.nitrous / (g.n * 6);
    if (g.rot) onReq += 1;
    const margin = fuel.octane - onReq;
    let retard = 0, detonation = 0;
    if (margin < 0) {
      if (cfg.knockControl) {
        retard = Math.min(20, -margin / 0.8);
        detonation = Math.max(0, -margin / 0.8 - 20);     // ran out of retard authority
      } else detonation = -margin / 0.8;
    }
    const timingEff = cfg.knockControl ? cfg.timing - retard : cfg.timing;

    // ---- efficiency ----
    const crx = g.rot ? cfg.cr : cfg.cr;
    let etaI = (g.rot ? 0.72 : 0.855) * (1 - Math.pow(crx, -0.3)) * (g.rot ? 1 : vt.eff);
    etaI *= Math.pow(g.cylVolL / 0.5, 0.03);
    etaI *= 1 - 0.07 * Math.exp(-rpm / 1500);
    // spark timing off MBT costs efficiency (advance past MBT too)
    const off = timingEff;
    etaI *= off < 0 ? 1 - (0.009 * -off + 0.0002 * off * off) : 1 - 0.0025 * off * off;
    if (detonation > 0) etaI *= 1 - Math.min(0.15, detonation * 0.01);
    const fl = lambda < 0.88 ? 1 - 2.5 * (lambda - 0.88) ** 2 : 1 - 2.6 * (lambda - 0.88) ** 2 - (lambda > 1 ? (lambda - 1) * 1.1 : 0);
    const imep = etaI * fl * fuel.energy * rho * ve;        // Pa

    // ---- losses ----
    const vp = pistonSpeed(cfg, rpm);
    let fmep = (0.38 + 0.042 * vp + 0.0019 * vp * vp + vt.fmep + 0.012 * (g.n - 4)) * 1e5;
    if (g.rot) fmep = (0.55 + 0.03 * vp + 0.002 * vp * vp) * 1e5;
    // exhaust back pressure from turbine
    let pmep = 0;
    if (hasTurbo) {
      // the turbine only builds back-pressure for the part of the boost the EXHAUST makes
      const arB = { small: 1.35, med: 1.0, large: 0.72 }[cfg.turbineAR];
      const prT = asp === 'esc_turbo' ? PR / escPR : PR;
      pmep = (prT - 1) * turbShare * 0.42 * arB * (0.4 + flowRatio * flowRatio) * 1e5 * (cfg.antilag ? 1.08 : 1);
      if (eHarvest > 0) pmep += eHarvest / Math.max(1e-6, g.D * rpm / (g.rot ? 60 : 120)) * 0.15;
    }
    const bmep = imep - fmep - pmep;
    const k = g.rot ? 2 * Math.PI : 4 * Math.PI;
    let torque = bmep * g.D / k;
    // supercharger drive loss
    let scLoss = 0;
    if (scDrive && PR > 1.001) {
      const W = mdot * CP * T_AMB * (Math.pow(PR, 0.2857) - 1) / etaC / 0.92;
      scLoss = W / (rpm / 60 * 2 * Math.PI);
      torque -= scLoss;
    } else if (asp === 'sc_roots' || asp === 'sc_screw') {
      torque -= 4;  // spinning bypassed rotors
    }
    // nitrous
    const nosPow = nosFrac * cfg.nitrous * HP * 0.92;
    const omega = rpm / 60 * 2 * Math.PI;
    torque += nosPow / omega;

    const power = torque * omega;                           // W

    // ---- EGT ----
    let egt = 790 + 6 * rpm / 1000 + retard * 11 + (lambda - 0.85) * 650 + 35 * (PR - 1) + (g.rot ? 110 : 0)
      - (cfg.timing > 0 ? cfg.timing * 3 : cfg.timing * 9) + (cfg.antilag ? 40 : 0);
    egt = clamp(egt, 500, 1300);

    // brake thermal efficiency
    const fuelPower = mdot / (lambda * fuel.stoich) * fuel.lhv;
    const bte = fuelPower > 0 ? Math.max(0, (power - nosPow) / fuelPower) : 0;

    return {
      rpm, torque, power, boostPsi, PR, ve, lambda, retard, detonation, margin, egt, Tch, mdot, flowRatio,
      bmep: bmep / 1e5, fmep: fmep / 1e5, injDuty, leanOut, scLoss, bte, spool, vp, onReq,
      eDraw, eHarvest, escPR, exhPR,
    };
  }

  /* Mechanical rev ceiling ----------------------------------------------
     The highest rpm the rotating assembly can physically survive, set by
     whichever runs out first: mean piston speed (rod/bearing loads), piston
     inertia (heavy big-bore pistons yanked back and forth) or valve float.
     A big-bore long-stroke pushrod V8 tops out low; a short-stroke DOHC
     four with tiny pistons screams. */
  const INERTIA_K = { cast: 6.6e6, hyper: 7.4e6, forged: 8.6e6, billet: 11.5e6 };
  function revCeiling(cfg) {
    if (cfg.layout === 'R') {
      const rpm = { cast: 9500, hyper: 10000, forged: 11000, billet: 12500 }[cfg.internals] + 600 * (1 - cfg.rotorCC / 654);
      return { rpm: Math.floor(rpm / 100) * 100, by: 'apex seals', fix: 'tougher rotor & seal grade' };
    }
    const inn = INTERNALS[cfg.internals];
    const cands = [
      { rpm: inn.vp * 1.12 * 60 / (2 * cfg.stroke / 1000), by: 'piston speed', fix: 'shorter stroke or stronger rods' },
      { rpm: INERTIA_K[cfg.internals] / Math.sqrt(cfg.bore * cfg.bore * cfg.stroke), by: 'piston mass', fix: 'smaller bore/stroke or lighter internals' },
      { rpm: valveFloat(cfg) * 1.03, by: 'valve float', fix: 'stiffer valve springs or an overhead-cam head' },
    ];
    cands.sort((a, b) => a.rpm - b.rpm);
    const c = cands[0];
    return { rpm: Math.floor(Math.min(20000, c.rpm) / 100) * 100, by: c.by, fix: c.fix };
  }

  /* Hybrid / KERS motor torque at crank -------------------------------- */
  function hybridTorque(cfg, rpm) {
    if (!cfg.mguk) return 0;
    const P = cfg.mguk * 1000;
    const base = 3000;
    const w = Math.max(rpm, 1) / 60 * 2 * Math.PI;
    const tmax = P / (base / 60 * 2 * Math.PI);
    return Math.min(tmax, P / w);
  }

  function idleRpm(cfg) {
    const c = cfg.cam / 100;
    if (cfg.layout === 'R') return 900 + 400 * c;
    return Math.round(750 + 450 * c * c + (cfg.valvetrain === 'PNEU' ? 2500 : 0) + (cfg.cyl <= 2 ? 150 : 0));
  }

  /* Full curve analysis ------------------------------------------------- */
  function analyze(cfg) {
    const g = geometry(cfg);
    const redline = cfg.redline;
    const r0 = 1000;
    const step = Math.max(50, Math.round((redline - r0) / 140 / 50) * 50);
    const rpms = [], tq = [], pw = [], boost = [], ve = [], lam = [], tqNA = [], hy = [], egt = [], ret = [], bte = [], tqNoE = [], eKw = [], boostNoE = [];
    const pts = [];
    for (let r = r0; r <= redline + 1; r += step) {
      const p = solvePoint(cfg, r);
      const pn = isTurbo(cfg) || hasElec(cfg) ? solvePoint(cfg, r, { naOnly: true }) : p;
      const pe = hasElec(cfg) ? solvePoint(cfg, r, { noElec: true }) : p;
      tqNoE.push(pe.torque); eKw.push((p.eDraw - p.eHarvest) / 1000); boostNoE.push(pe.boostPsi);
      rpms.push(r); tq.push(p.torque); pw.push(p.power); boost.push(p.boostPsi); ve.push(p.ve);
      lam.push(p.lambda); tqNA.push(pn.torque); hy.push(hybridTorque(cfg, r)); egt.push(p.egt); ret.push(p.retard); bte.push(p.bte);
      pts.push(p);
    }
    let iP = 0, iT = 0;
    for (let i = 0; i < rpms.length; i++) { if (pw[i] > pw[iP]) iP = i; if (tq[i] > tq[iT]) iT = i; }
    const peakP = pw[iP], peakT = tq[iT];
    // powerband: rpm range with >= 90% of peak torque
    let bandLo = null, bandHi = null;
    for (let i = 0; i < rpms.length; i++) if (tq[i] >= 0.9 * peakT) { if (bandLo == null) bandLo = rpms[i]; bandHi = rpms[i]; }
    // spool: first rpm hitting 90% of max boost
    const maxBoost = Math.max.apply(null, boost);
    let spoolRpm = null;
    if (maxBoost > 0.5) for (let i = 0; i < rpms.length; i++) if (boost[i] >= 0.9 * maxBoost) { spoolRpm = rpms[i]; break; }
    // combined hybrid
    let peakHy = 0, peakHyT = 0;
    for (let i = 0; i < rpms.length; i++) {
      const t = tq[i] + hy[i];
      peakHyT = Math.max(peakHyT, t);
      peakHy = Math.max(peakHy, t * rpms[i] / 60 * 2 * Math.PI);
    }

    const stress = stressModel(cfg, pts, g, peakT);
    const mass = engineMass(cfg, g);
    const cost = buildCost(cfg, g);

    return {
      cfg, g, rpms, tq, pw, boost, ve, lam, tqNA, hy, egt, ret, bte, pts, step, tqNoE, eKw, boostNoE, elec: hasElec(cfg),
      eDrawMax: Math.max(0, Math.max.apply(null, eKw)), eHarvestMax: Math.max(0, -Math.min.apply(null, eKw)),
      peakP, peakT, rpmP: rpms[iP], rpmT: rpms[iT], bandLo, bandHi, maxBoost, spoolRpm,
      peakHy, peakHyT, idle: idleRpm(cfg), floatRpm: valveFloat(cfg), ceiling: revCeiling(cfg),
      specific: peakP / HP / g.dispL, mass, cost, ...stress,
      vpMax: pistonSpeed(cfg, redline),
      bmepMax: Math.max.apply(null, pts.map(p => p.bmep)),
      bteMax: Math.max.apply(null, bte),
    };
  }

  function stressCurve(s) {
    if (s < 0.8) return 1;
    return clamp(1 - 1.6 * Math.pow(s - 0.8, 1.5), 0, 1);
  }

  function stressModel(cfg, pts, g, peakT) {
    const inn = INTERNALS[cfg.internals];
    const warns = [];
    const factors = [];
    const add = (key, s, msgs) => {
      const f = stressCurve(s);
      factors.push({ key, s, f });
      if (s >= 0.8) warns.push({ key, sev: s >= 1.15 ? 'critical' : s >= 1 ? 'serious' : 'warning', msg: msgs, s });
    };
    const vp = pistonSpeed(cfg, cfg.redline);
    if (!g.rot) add('rod', vp / inn.vp, `Mean piston speed ${vp.toFixed(1)} m/s at redline (${inn.name.toLowerCase()} rods rated ~${inn.vp} m/s)`);
    else add('apex', cfg.redline / 10500, `Apex seals spinning ${cfg.redline} rpm — rotaries get grumpy past ~9500`);
    const bmepMax = Math.max.apply(null, pts.map(p => p.bmep));
    add('bmep', bmepMax / inn.bmep * (cfg.block === 'alu' && !g.rot ? 1.05 : 1), `Peak BMEP ${bmepMax.toFixed(1)} bar on ${inn.name.toLowerCase()} internals (limit ~${inn.bmep} bar)`);
    if (!g.rot) {
      const fl = valveFloat(cfg);
      add('float', cfg.redline / fl * 0.85, `Valvetrain floats around ${Math.round(fl / 100) * 100} rpm`);
    }
    const det = Math.max.apply(null, pts.map(p => p.detonation));
    if (det > 0) add('knock', 0.95 + det / 4, cfg.knockControl ? `Knock control out of authority — detonation even at 20° retard` : `Knock sensor OFF: detonation detected (${det.toFixed(1)}° past limit)`);
    const egt = Math.max.apply(null, pts.map(p => p.egt));
    add('egt', (egt - 600) / (1010 - 600), `EGT peaks ${Math.round(egt)}°C`);
    const lean = pts.filter(p => p.leanOut);
    if (lean.length) {
      const worst = Math.max.apply(null, pts.map(p => p.injDuty));
      add('lean', 0.95 + (worst - 1) * 3, `Injectors maxed out (${Math.round(worst * 100)}% duty) — engine running lean`);
    }
    if (cfg.nitrous > 0) add('nos', cfg.nitrous / (g.n * inn.nos), `${cfg.nitrous} hp nitrous shot on ${inn.name.toLowerCase()} internals`);
    const maxPR = Math.max.apply(null, pts.map(p => p.PR));
    if (maxPR > 1.05) add('gasket', (maxPR - 1) / ({ cast: 1.4, hyper: 1.8, forged: 2.9, billet: 4.2 }[cfg.internals]) * (cfg.block === 'alu' ? 1.05 : 0.95), `Head gasket sees ${((maxPR - 1) * 14.7).toFixed(1)} psi`);
    if (cfg.antilag) add('als', 0.95, 'Anti-lag cooks turbos and exhaust valves');
    const chokers = pts.filter(p => p.flowRatio > 0.97);
    if (chokers.length > 3) add('choke', 0.9, 'Turbo is choking at high rpm — it is too small for this engine');
    const fuelWarn = pts.some(p => p.margin < -2) && cfg.knockControl;
    if (fuelWarn) warns.push({ key: 'retard', sev: 'warning', msg: `Fuel octane too low — ECU pulling up to ${Math.round(Math.max.apply(null, pts.map(p => p.retard)))}° of timing`, s: 0.8 });

    let rel = 100;
    factors.forEach(f => { rel *= f.f; });
    if (cfg.antilag) rel *= 0.93;
    rel = clamp(rel, 0, 100);
    warns.sort((a, b) => b.s - a.s);
    // failure probability per full-throttle run
    const failChance = rel >= 75 ? 0.002 * (100 - rel) / 25 : clamp(Math.pow((75 - rel) / 75, 1.6) * 0.9 + 0.002, 0, 0.97);
    const worst = factors.slice().sort((a, b) => b.s - a.s)[0];
    return { reliability: rel, warns, failChance, failMode: failureMode(worst ? worst.key : 'rod', g) };
  }

  function failureMode(key, g) {
    return ({
      rod: 'Threw a connecting rod through the block!', apex: 'Apex seal let go — rotor housing scored!',
      bmep: g.rot ? 'Cracked a rotor housing!' : 'Cracked a piston ring land!', float: 'Valve kissed a piston — bent valves!',
      knock: 'Detonation melted a piston!', egt: 'Burned an exhaust valve!', lean: 'Lean condition holed a piston!',
      nos: 'Nitrous backfire blew the intake manifold off!', gasket: 'Blew the head gasket!',
      als: 'Turbo shaft snapped!', choke: 'Turbo over-sped and grenaded!',
    })[key] || 'Engine let go!';
  }

  function engineMass(cfg, g) {
    let m;
    if (g.rot) m = 40 + 30 * g.n;
    else {
      m = 28 + 31 * g.dispL + 2.6 * g.n + (cfg.valvetrain === 'OHV' ? -4 : cfg.valvetrain === 'SOHC' ? 2 : 7) * (cfg.layout === 'I' ? 1 : 1.6);
      if (cfg.block === 'iron') m *= 1.3;
    }
    const tc = isTurbo(cfg) ? cfg.turboCount * (8 + cfg.turboSize * 0.14) + 6 : 0;
    const el = (cfg.eturbo && isTurbo(cfg) && cfg.aspiration !== 'twin' ? 4 + cfg.eturboKw * 0.12 : 0)
      + (cfg.aspiration === 'esc' || cfg.aspiration === 'esc_turbo' ? 6 + cfg.escKw * 0.25 : 0)
      + (hasElec(cfg) && !cfg.mguk ? 12 : 0);   // 48 V battery + DC/DC
    const sc = cfg.aspiration.startsWith('sc') || cfg.aspiration === 'twin' ? 16 : 0;
    const ic = { none: 0, air: 12, water: 16 }[cfg.intercooler] * (cfg.aspiration === 'na' ? 0 : 1);
    const hy = cfg.mguk ? cfg.mguk * 0.13 + cfg.battery * 0.0065 + 6 : 0;
    const fly = { stock: 0, light: -4, ultra: -7 }[cfg.flywheel];
    return m + tc + sc + ic + hy + fly + el;
  }

  function buildCost(cfg, g) {
    let c = 1800 + 1300 * Math.pow(g.n, 0.95) + 650 * g.dispL;
    if (g.rot) c = 3500 + 2600 * g.n;
    c += VALVETRAIN[cfg.valvetrain].cost * (g.rot ? 0 : Math.max(1, g.n / 4));
    c += SPRINGS[cfg.springs].cost * (g.rot ? 0 : Math.max(1, g.n / 4));
    c += { none: 0, intake: 500, dual: 1100, lift: 1900 }[cfg.vvt] * (g.rot ? 0 : 1);
    c += cfg.cam * 18;
    c += INTERNALS[cfg.internals].cost + (cfg.internals === 'forged' ? 260 * g.n : cfg.internals === 'billet' ? 900 * g.n : 0);
    c += cfg.block === 'alu' ? 1400 : 0;
    if (isTurbo(cfg)) c += cfg.turboCount * (700 + 0.55 * cfg.turboSize * cfg.turboSize) + (cfg.turboCount - 1) * 900 + 600;
    if (cfg.eturbo && isTurbo(cfg) && cfg.aspiration !== 'twin') c += 3500 + cfg.eturboKw * 180;
    if (cfg.aspiration === 'esc' || cfg.aspiration === 'esc_turbo') c += 1800 + cfg.escKw * 150;
    if (hasElec(cfg) && !cfg.mguk) c += 1200;
    if (cfg.aspiration === 'sc_roots') c += 4200;
    if (cfg.aspiration === 'sc_screw' || cfg.aspiration === 'twin') c += 6200;
    if (cfg.aspiration === 'sc_centri') c += 4800;
    if (cfg.aspiration !== 'na') c += { none: 0, air: 900, water: 2300 }[cfg.intercooler];
    if (cfg.antilag) c += 1600;
    c += INTAKES[cfg.intake].cost + EXHAUSTS[cfg.exhaust].cost;
    c += Math.max(0, cfg.injector - 300) * 0.9 * (g.rot ? 4 : g.n) * 0.25;
    c += FUELS[cfg.fuel].cost;
    c += cfg.nitrous ? 750 + cfg.nitrous * 4 : 0;
    c += cfg.mguk ? cfg.mguk * 110 + cfg.battery * 3.2 + 2500 : 0;
    c += { stock: 0, light: 400, ultra: 900 }[cfg.flywheel];
    if (cfg.timing !== 0 || cfg.lambda !== 0.88 || cfg.pops !== 'off') c += 600;
    return Math.round(c / 10) * 10;
  }

  /* Drag strip simulation ----------------------------------------------- */
  /* Car / drivetrain setup shared by the drag sim and the live 3D test track */
  function carSetup(cfg, an) {
    const car = cfg;
    const tire = TIRES[car.tires];
    const mass = car.chassis + an.mass + 75 + ((BRAKES[car.brakes] || BRAKES.stock).kg) + (car.chute ? 9 : 0);
    const g9 = 9.81;
    const rw = 0.33;
    const drv = car.drivetrain;
    const driveFrac = drv === 'AWD' ? 1 : drv === 'RWD' ? 0.62 : 0.56;
    const dtEff = drv === 'AWD' ? 0.8 : drv === 'RWD' ? 0.85 : 0.88;
    const shiftT = { manual: 0.42, auto: 0.3, dct: 0.09, seq: 0.05 }[car.gearbox];
    const CdA = car.cda;
    const redline = cfg.redline;
    // estimate top speed ignoring gearing to pick ratios
    const peakWheelP = an.peakP * dtEff;
    let vmax = 10;
    for (let v = 10; v < 200; v += 0.5) {
      const Fd = 0.5 * 1.2 * CdA * v * v + 0.013 * mass * g9;
      if (Fd * v > peakWheelP) break; vmax = v;
    }
    const n = car.gears;
    const topOverall = (redline * 0.98 / 60 * 2 * Math.PI) * rw / (vmax * (1.02 + 0.08 * (car.gearing - 50) / 50));
    const spread = 2.9 + 0.32 * (n - 4);
    const firstOverall = topOverall * spread * (1 - 0.18 * (car.gearing - 50) / 50);
    const ratios = [];
    for (let i = 0; i < n; i++) {
      // progressive ratios: closer at the top
      const p = Math.pow(i / (n - 1), 0.85);
      ratios.push(firstOverall * Math.pow(topOverall / firstOverall, p));
    }
    return { tire, mass, g9, rw, drv, driveFrac, dtEff, shiftT, CdA, ratios, vmax, n };
  }

  function dragSim(cfg, an, opts) {
    opts = opts || {};
    const car = cfg;
    const S = carSetup(cfg, an);
    const { tire, mass, g9, rw, drv, driveFrac, dtEff, shiftT, CdA, ratios, vmax, n } = S;
    const redline = cfg.redline;
    const idle = an.idle;
    const lerpCurve = (arr, rpm) => {
      const r = clamp(rpm, an.rpms[0], an.rpms[an.rpms.length - 1]);
      const f = (r - an.rpms[0]) / an.step;
      const i = Math.min(arr.length - 2, Math.floor(f));
      const t = f - i;
      return arr[i] * (1 - t) + arr[i + 1] * t;
    };

    const dt = 0.002;
    let t = 0, x = 0, v = 0, gear = 0, shiftLeft = 0, boostF = an.maxBoost > 0.5 ? 0.15 : 1, batt = (cfg.battery || 0) * 1000;
    let rpm = car.launchRpm;
    const out = { frames: [], ratios, mass, vmax };
    const marks = {};
    const MI = 1609.344;
    let failed = null;
    const failAt = opts.failRoll != null && opts.failRoll < an.failChance ? (0.35 + opts.failRoll / Math.max(an.failChance, 1e-6) * 0.5) : null;
    let frameAcc = 0, wheelspin = false, maxT = 40;
    const hasTurbo = isTurbo(cfg) || hasElec(cfg);
    const elec = hasElec(cfg);
    const eTurbo = !!(cfg.eturbo && isTurbo(cfg) && cfg.aspiration !== 'twin');
    let eBatt = cfg.mguk ? null : 1.0e6;            // 48 V pack (~0.28 kWh usable) unless sharing the hybrid battery
    let boostE = 0.3;                                // electric-boost transient (e-motors spin up in ~0.15 s)
    const tau = !isTurbo(cfg) ? 0.05 : (0.12 + 0.55 * Math.pow(cfg.turboSize / 60, 2) * Math.sqrt(2.5 / an.g.dispL) / Math.sqrt(cfg.turboCount)) * (cfg.antilag ? 0.35 : 1);
    let shifting = false, kersOn = false, eNow = false;
    const finish = opts.dist || MI / 4;
    while (t < maxT) {
      const ratio = ratios[gear];
      const wheelRpm = v / rw / (2 * Math.PI) * 60;
      const coupledRpm = wheelRpm * ratio;
      let throttle = 1;
      let Fdrive = 0;
      kersOn = false;
      if (shiftLeft > 0) {
        shiftLeft -= dt; throttle = car.gearbox === 'seq' || car.gearbox === 'dct' ? 0.6 : 0;
        rpm += (coupledRpm - rpm) * Math.min(1, dt / Math.max(0.02, shiftT * 0.5));
        if (cfg.antilag) throttle = Math.max(throttle, 0.3);
        if (shiftLeft <= 0) shifting = false;
      } else {
        const slipping = coupledRpm < car.launchRpm && gear === 0;
        rpm = slipping ? Math.max(car.launchRpm, coupledRpm) : coupledRpm;
        rpm = Math.max(rpm, idle);
        const elecOn = elec && (eBatt == null ? batt > 0 : eBatt > 0);
        const tNA = lerpCurve(an.tqNA, rpm), tFull = lerpCurve(an.tq, rpm);
        let T;
        if (elec) {
          // exhaust-driven boost lags (unless an e-turbo spins it), electric boost arrives almost at once
          const tNoE = lerpCurve(an.tqNoE, rpm);
          T = tNA + (tNoE - tNA) * boostF + (elecOn ? (tFull - tNoE) * boostE : 0);
          if (elecOn) {
            const e = Math.max(0, lerpCurve(an.eKw, rpm)) * 1000 * boostE * dt;
            if (eBatt == null) batt -= e; else eBatt -= e;
          }
          eNow = elecOn;
        } else T = hasTurbo ? tNA + (tFull - tNA) * boostF : tFull;
        if (rpm >= redline) T = 0;
        let Tk = 0;
        if (cfg.mguk && batt > 0) {
          Tk = hybridTorque(cfg, rpm);
          batt -= Tk * rpm / 60 * 2 * Math.PI * dt;
          kersOn = true;
        }
        Fdrive = (T + Tk) * ratio * dtEff / rw;
        // shift point: shift when next gear makes more thrust or at redline
        if (gear < n - 1 && !slipping) {
          const nr = ratios[gear + 1];
          const rpmN = rpm * nr / ratio;
          const tN = lerpCurve(an.tq, rpmN) + (cfg.mguk && batt > 0 ? hybridTorque(cfg, rpmN) : 0);
          if (rpm >= redline * 0.985 || (tN * nr > (T + Tk) * ratio * 1.0 && rpm > an.rpmP * 0.98)) {
            gear++; shiftLeft = shiftT; shifting = true;
          }
        }
      }
      const traction = tire.mu * mass * g9 * driveFrac * (1 + (drv === 'RWD' ? 0.25 : drv === 'FWD' ? -0.1 : 0) * Math.min(1, Fdrive / (mass * g9)));
      wheelspin = Fdrive > traction;
      if (wheelspin) Fdrive = traction * 0.92 + (Fdrive - traction) * 0.02;
      if (wheelspin && shiftLeft <= 0 && gear >= 0) {
        // tyres spinning: let rpm flare a bit above coupled
        rpm = Math.min(redline, rpm + 300 * Math.min(1, (Fdrive) / traction - 0.5));
      }
      const Faero = 0.5 * 1.2 * CdA * v * v;
      const Froll = 0.013 * mass * g9;
      const a = (Fdrive - Faero - Froll) / (mass * 1.04);
      v = Math.max(0, v + a * dt);
      x += v * dt;
      t += dt;
      // turbo transient
      const bTarget = throttle > 0.5 ? 1 : (cfg.antilag ? 0.85 : 0.1);
      const tauT = eTurbo && eNow ? 0.07 : tau;
      boostF += (bTarget - boostF) * Math.min(1, dt / (bTarget > boostF ? tauT : 0.15));
      boostE += ((throttle > 0.5 ? 1 : 0.2) - boostE) * Math.min(1, dt / 0.15);
      const mph = v * 2.23694;
      if (!marks.ft60 && x >= 18.288) marks.ft60 = t;
      if (!marks.ft330 && x >= 100.584) marks.ft330 = t;
      if (!marks.t60 && mph >= 60) marks.t60 = t;
      if (!marks.t100k && v * 3.6 >= 100) marks.t100k = t;
      if (!marks.t100 && mph >= 100) marks.t100 = t;
      if (!marks.t200k && v * 3.6 >= 200) marks.t200k = t;
      if (!marks.e8 && x >= MI / 8) { marks.e8 = t; marks.trap8 = mph; }
      if (!marks.q && x >= MI / 4) { marks.q = t; marks.trap = mph; }
      if (!marks.fin && x >= finish) { marks.fin = t; marks.trapFin = mph; }
      if (failAt && !failed && x >= finish * failAt) { failed = { t, x, rpm }; }
      frameAcc += dt;
      if (frameAcc >= 1 / 120 - 1e-9) {
        frameAcc -= 1 / 120;
        out.frames.push({ t, x, v, rpm, gear: gear + 1, ratio: ratios[gear], eb: eNow ? boostE : 0, throttle: shiftLeft > 0 ? throttle : 1, boost: hasTurbo ? boostF : 1, spin: wheelspin, kers: kersOn, batt, shifting });
      }
      if (failed) break;
      if (x >= finish + 30) break;
    }
    out.marks = marks;
    out.failed = failed;
    out.vmaxGearing = (redline / 60 * 2 * Math.PI) * rw / ratios[n - 1];
    out.topSpeed = Math.min(vmax, out.vmaxGearing);
    return out;
  }


  /* ---------------------------------------------------------------------
     BRAKES — torque capacity, pad friction vs temperature, rotor heat,
     fluid boil, brake bias with weight transfer, ABS / lock-up.
     --------------------------------------------------------------------- */
  const BRAKES = {
    stock: { name: 'Stock (1-piston sliding, 300 mm iron)', torque: 6200, rotorKg: 30, c: 460, h0: 26, fade: 0, kg: 0, cost: 0 },
    sport: { name: 'Sport (4-piston, 330 mm vented)', torque: 7800, rotorKg: 34, c: 460, h0: 36, fade: 30, kg: 2, cost: 1900 },
    bbk: { name: 'Big brake kit (6-piston, 380 mm 2-piece)', torque: 9800, rotorKg: 40, c: 460, h0: 50, fade: 60, kg: 5, cost: 4600 },
    race: { name: 'Race (6-piston mono-block, 380 mm, ducted)', torque: 10300, rotorKg: 37, c: 460, h0: 62, fade: 90, kg: 2, cost: 7800 },
    ccm: { name: 'Carbon-ceramic (6/4-piston, 410 mm)', torque: 11000, rotorKg: 18, c: 1150, h0: 48, fade: 230, kg: -13, cost: 14500 },
  };
  // pad friction coefficient vs rotor temperature (°C)
  const PADS = {
    street: { name: 'Street ceramic', mu: 0.42, coldMu: 0.40, warmT: 60, fadeT: 380, cost: 0 },
    perf: { name: 'Performance', mu: 0.47, coldMu: 0.38, warmT: 120, fadeT: 540, cost: 300 },
    race: { name: 'Race compound', mu: 0.56, coldMu: 0.28, warmT: 260, fadeT: 780, cost: 650 },
  };
  const FLUIDS = {
    dot4: { name: 'DOT 4', boil: 230, cost: 0 },
    dot51: { name: 'DOT 5.1', boil: 265, cost: 60 },
    race: { name: 'Racing fluid', boil: 312, cost: 180 },
  };
  // tyre friction available for BRAKING (drag tyres are built to launch, not stop)
  const BRAKE_MU = { street: 0.95, perf: 1.05, semi: 1.2, radial: 1.0, slick: 1.25 };
  const T_AIR = 30;

  function padMu(cfg, T) {
    const P = PADS[cfg.pads], B = BRAKES[cfg.brakes];
    let mu;
    if (T < P.warmT) mu = P.coldMu + (P.mu - P.coldMu) * clamp((T - 20) / Math.max(1, P.warmT - 20), 0, 1);
    else mu = P.mu;
    const fadeT = P.fadeT + B.fade;
    if (T > fadeT) mu *= Math.max(0.3, 1 - (T - fadeT) / 330);
    return mu;
  }
  function newBrakeState() { return { T: T_AIR, Tr: T_AIR, Tf: T_AIR }; }
  /* One brake step. st = {T front rotors °C, Tr rear rotors °C, Tf fluid °C}; pedal 0..1; v m/s;
     decel (m/s², +ve = slowing) for weight transfer. */
  function brakeStep(cfg, S, st, pedal, v, decel, dt) {
    const B = BRAKES[cfg.brakes], FL = FLUIDS[cfg.fluid];
    const g = 9.81, W = S.mass * g;
    const muF = padMu(cfg, st.T), muR = padMu(cfg, st.Tr);
    const boil = st.Tf > FL.boil;
    const press = pedal * (boil ? 0.45 : 1);
    const b = cfg.brakeBias / 100;
    // caliper clamping x pad friction -> force each axle can make
    const capF = B.torque * b * (muF / 0.42) / S.rw * press;
    const capR = B.torque * (1 - b) * (muR / 0.42) / S.rw * press;
    // dynamic load on each axle (CG height / wheelbase ≈ 0.2)
    const wf = clamp(0.56 + 0.2 * clamp(decel / g, 0, 1.6), 0.3, 0.92), wr = 1 - wf;
    // tyre load sensitivity: rubber grips a little less per kg as load rises, so heavy cars stop longer
    const tmu = (BRAKE_MU[cfg.tires] || 1) * clamp(Math.pow(1500 / S.mass, 0.12), 0.82, 1.12);
    const gripF = tmu * W * wf, gripR = tmu * W * wr;
    let fF = capF, fR = capR, lockF = false, lockR = false;
    if (cfg.abs) { fF = Math.min(fF, gripF * 0.96); fR = Math.min(fR, gripR * 0.96); }
    else {
      if (fF > gripF) { fF = gripF * 0.72; lockF = true; }   // sliding rubber grips ~25% less
      if (fR > gripR) { fR = gripR * 0.72; lockR = true; }
    }
    const moving = v > 0.05;
    if (!moving) { fF = 0; fR = 0; }
    // heat: each axle's braking power into its rotors; convective cooling improves with speed
    const kF = 0.6, kR = 0.4;                         // fronts are bigger and do more of the work
    const CF = B.rotorKg * kF * B.c, CR = B.rotorKg * kR * B.c;
    const h = (B.h0 + (cfg.brakeDucts ? 22 : 0)) * (1 + v / 15);
    st.T = Math.max(T_AIR, st.T + (fF * v * 0.92 - h * kF * (st.T - T_AIR)) * dt / CF);
    st.Tr = Math.max(T_AIR, st.Tr + (fR * v * 0.92 - h * kR * (st.Tr - T_AIR)) * dt / CR);
    const hot = Math.max(st.T, st.Tr);
    st.Tf += ((T_AIR + (hot - T_AIR) * 0.45) - st.Tf) * Math.min(1, dt / 9);   // fluid heat-soaks from the calipers
    const P = PADS[cfg.pads], fadeT = P.fadeT + B.fade;
    const fadeF = st.T > fadeT && muF < P.mu * 0.85, fadeR = st.Tr > fadeT && muR < P.mu * 0.85;
    return {
      F: fF + fR, fF, fR, lockF: moving && lockF, lockR: moving && lockR, muF, muR, mu: Math.min(muF, muR),
      bite: Math.min(muF, muR) / P.mu, fade: fadeF || fadeR, fadeF, fadeR,
      cold: hot < P.warmT * 0.7 && cfg.pads === 'race', boil,
      abs: cfg.abs && moving && pedal > 0.5 && (capF > gripF * 0.96 || capR > gripR * 0.96),
    };
  }
  /* Bench numbers for the parts UI: cold stopping distances, peak decel, fade resistance. */
  function brakeEstimate(cfg, an) {
    const S = carSetup(cfg, an);
    const stop = (v0, st) => {
      let v = v0, x = 0, a = 0, peakA = 0, locked = false; const dt = 0.004;
      while (v > 0 && x < 2000) {
        const r = brakeStep(cfg, S, st, 1, v, a, dt);
        const Fa = 0.5 * 1.2 * S.CdA * v * v + 0.013 * S.mass * 9.81;
        a = (r.F + Fa) / (S.mass * 1.04); peakA = Math.max(peakA, a); locked = locked || r.lockF || r.lockR;
        v -= a * dt; x += Math.max(0, v) * dt;
      }
      return { x, peakA, locked };
    };
    const d100 = stop(100 / 3.6, newBrakeState());
    const d200 = stop(200 / 3.6, newBrakeState());
    // repeated hard stops from 200 km/h with a 15 s run at 150 km/h between them
    const st = newBrakeState(); let stops = 0;
    for (; stops < 12; stops++) {
      stop(200 / 3.6, st);
      const ft = PADS[cfg.pads].fadeT + BRAKES[cfg.brakes].fade;
      if ((Math.max(st.T, st.Tr) > ft && padMu(cfg, Math.max(st.T, st.Tr)) < PADS[cfg.pads].mu * 0.85) || st.Tf > FLUIDS[cfg.fluid].boil) break;
      for (let t = 0; t < 15; t += 0.05) brakeStep(cfg, S, st, 0, 150 / 3.6, 0, 0.05);
    }
    return { d100: d100.x, d200: d200.x, g: d100.peakA / 9.81, locks: d100.locked || d200.locked, stops, tempAfter: st.T, mass: S.mass };
  }

  const api = {
    FUELS, VALVETRAIN, INTERNALS, INTAKES, EXHAUSTS, ASPIRATION, TIRES, SPRINGS,
    HP, LBFT, PSI, geometry, solvePoint, analyze, revCeiling, isTurbo, hasElec, carSetup,
    BRAKES, PADS, FLUIDS, brakeStep, brakeEstimate, newBrakeState, padMu, hybridTorque, idleRpm, valveFloat, dragSim, pistonSpeed, clamp,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EnginePhysics = api;
})(this);
