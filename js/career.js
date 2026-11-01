/* =====================================================================
   TORQUESMITH — career mode data + rules
   Pure data/logic. The UI glue lives in app.js.
   ===================================================================== */
(function (root) {
  'use strict';
  const E = root.EnginePhysics, PRE = root.EnginePresets;

  const DIFFICULTY = {
    easy: { name: 'Easy', cash: 16000, prize: 1.5, price: 0.75, rival: 1.05, fail: 0.5, repair: 0.15,
      blurb: 'Fat wallet, cheap parts, slow rivals, engines that forgive you.' },
    normal: { name: 'Normal', cash: 9000, prize: 1.0, price: 1.0, rival: 1.0, fail: 1.0, repair: 0.3,
      blurb: 'The intended experience. Rivals run their real times.' },
    hard: { name: 'Hard', cash: 6000, prize: 0.8, price: 1.2, rival: 0.975, fail: 1.35, repair: 0.5,
      blurb: 'Tight budget, pricier parts, faster rivals, angrier engines.' },
    hardcore: { name: 'Hardcore', cash: 4000, prize: 0.65, price: 1.35, rival: 0.955, fail: 1.7, repair: 0.6, permadeath: true,
      blurb: 'Blow an engine and you lose every engine upgrade. No mercy.' },
  };

  const TIERS = [
    { name: 'Street', color: '#8d8c84' },
    { name: 'Club', color: '#3987e5' },
    { name: 'Pro', color: '#199e70' },
    { name: 'Elite', color: '#9085e9' },
    { name: 'Legend', color: '#fab219' },
  ];

  /* Option values that need a tier. Anything not listed is available from Street. */
  const LOCKS = {
    aspiration: { sc_screw: 1, sc_centri: 1, esc: 1, twin: 2, esc_turbo: 2 },
    turboCount: { 2: 1, 4: 2 },
    internals: { forged: 1, billet: 2 },
    fuel: { e85: 1, race: 2, meth: 3 },
    valvetrain: { PNEU: 3 },
    springs: { race: 1 },
    vvt: { dual: 1, lift: 2 },
    intake: { itb: 1 },
    intercooler: { water: 1 },
    eturbo: { true: 2 },
    antilag: { true: 2 },
    knockControl: { false: 1 },
    tires: { semi: 1, radial: 2, slick: 3 },
    gearbox: { dct: 1, seq: 2 },
    drivetrain: { AWD: 1 },
    layout: { W: 3 },
    cyl: { 10: 2, 12: 2, 16: 3 },
    gears: { 8: 1, 9: 2, 10: 2 },
    straightCut: { true: 1 },
    flywheel: { ultra: 1 },
    brakes: { bbk: 1, race: 2, ccm: 3 },
    pads: { race: 1 },
    fluid: { race: 1 },
    chute: { true: 2 },
  };
  /* Slider ceilings per tier (index = tier). */
  const MAXES = {
    boost: [18, 26, 36, 50, 50],
    turboSize: [60, 72, 86, 100, 100],
    nitrous: [75, 150, 300, 500, 500],
    mguk: [0, 0, 120, 250, 400],
    eturboKw: [12, 12, 25, 80, 120],
    escKw: [8, 10, 20, 40, 40],
    battery: [0, 0, 4000, 8000, 10000],
    injector: [600, 1000, 1600, 2600, 2600],
  };
  function lockTier(id, value) {
    const L = LOCKS[id];
    if (!L) return 0;
    return L[String(value)] || 0;
  }
  function maxFor(id, tier) { const m = MAXES[id]; return m ? m[Math.min(tier, m.length - 1)] : null; }
  function minFor(id, tier, save) {
    if (id === 'chassis') return Math.round(save.baseChassis * [0.88, 0.78, 0.68, 0.6, 0.55][tier]);
    if (id === 'cda') return [0.6, 0.55, 0.48, 0.42, 0.36][tier];
    return null;
  }

  /* Car (non-engine) part values. */
  function carValue(c, save) {
    let v = { street: 0, perf: 700, semi: 1500, radial: 1300, slick: 2600 }[c.tires];
    v += { manual: 0, auto: 1400, dct: 4200, seq: 9500 }[c.gearbox];
    v += Math.max(0, c.gears - 5) * 450;
    v += { FWD: 0, RWD: 2500, AWD: 6500 }[c.drivetrain];
    v += Math.max(0, save.baseChassis - c.chassis) * 14;           // weight reduction: $14/kg
    v += Math.max(0, save.baseCda - c.cda) * 30000;                // aero work
    v += c.straightCut ? 1500 : 0;
    v += (E.BRAKES[c.brakes] || E.BRAKES.stock).cost + (E.PADS[c.pads] || E.PADS.street).cost + (E.FLUIDS[c.fluid] || E.FLUIDS.dot4).cost;
    v += (c.brakeDucts ? 450 : 0) + (c.chute ? 1300 : 0);
    return v;
  }
  function value(c, save) { return E.analyze(c).cost + carValue(c, save); }
  /* Price to go from the owned build to the working build. Downgrades refund 50%. */
  function changeCost(owned, working, save) {
    const d = value(working, save) - value(owned, save);
    const m = DIFFICULTY[save.diff].price;
    return d >= 0 ? Math.round(d * m) : Math.round(d * 0.5 * m);
  }

  const ENGINE_KEYS = ['layout', 'cyl', 'vAngle', 'crank', 'bore', 'stroke', 'rotorCC', 'block', 'internals', 'flywheel', 'valvetrain', 'springs', 'vvt', 'cam', 'cr', 'redline',
    'aspiration', 'turboCount', 'turboSize', 'turbineAR', 'boost', 'intercooler', 'bov', 'antilag', 'eturbo', 'eturboKw', 'escKw', 'intake', 'runner', 'fuel', 'injector', 'lambda',
    'timing', 'knockControl', 'pops', 'popStyle', 'nitrous', 'exhaust', 'headers', 'mguk', 'battery'];

  const STARTERS = {
    hatch: { title: 'Rusty Hatchback', blurb: '1.6 SOHC four, front-drive, light and cheap to tune. The underdog.', cfg: {
      name: 'Rusty Hatchback', layout: 'I', cyl: 4, bore: 79, stroke: 81.5, valvetrain: 'SOHC', vvt: 'none', cam: 15, cr: 10.2, redline: 6400, fuel: 'p87', injector: 240,
      internals: 'cast', exhaust: 'stock', intake: 'stock', chassis: 1050, drivetrain: 'FWD', tires: 'street', gears: 5, gearbox: 'manual', cda: 0.66, launchRpm: 3000 } },
    muscle: { title: 'Tired Muscle Coupe', blurb: '5.0 pushrod V8 in a heavy coupe with a 4-speed auto. Torque for days.', cfg: {
      name: 'Tired Muscle Coupe', layout: 'V', cyl: 8, vAngle: 90, crank: 'cross', bore: 101.6, stroke: 76.2, block: 'iron', valvetrain: 'OHV', vvt: 'none', cam: 10, cr: 8.3,
      redline: 4800, fuel: 'p87', injector: 260, internals: 'cast', exhaust: 'stock', intake: 'stock', chassis: 1520, drivetrain: 'RWD', tires: 'street', gears: 4, gearbox: 'auto',
      cda: 0.8, launchRpm: 2000 } },
    rotary: { title: 'Project Rotary Coupe', blurb: 'NA two-rotor, rear-drive, loves revs. Fragile when boosted.', cfg: {
      name: 'Project Rotary Coupe', layout: 'R', cyl: 2, rotorCC: 654, cam: 30, cr: 9.4, redline: 7500, fuel: 'p91', injector: 300, internals: 'cast',
      exhaust: 'stock', intake: 'stock', chassis: 1140, drivetrain: 'RWD', tires: 'street', gears: 5, gearbox: 'manual', cda: 0.64, launchRpm: 3500 } },
  };

  /* Event ladder. Targets are the rival's time at Normal difficulty.
     type: 'drag' (dist in m) or 'dyno' (target hp). req: entry restrictions. */
  const QM = 402.336, EM = 201.168;
  const EV = (tier, id, o) => Object.assign({ tier, id, dist: QM, type: 'drag', req: {} }, o);
  const EVENTS = [
    EV(0, 'lot', { name: 'Parking Lot Meet', rival: 'Kev & his “tuned” Civic', base: 'Econo Box I4 1.6', dist: EM, target: 12.4, fee: 0, prize: 600, flavor: 'Two cones, a flashlight for a start light, and Kev.' }),
    EV(0, 'dyno150', { name: 'Dyno Day: 150 hp', type: 'dyno', target: 150, fee: 100, prize: 1300, flavor: 'Strap it down and make the number.' }),
    EV(0, 'friday', { name: 'Friday Night Drags', rival: 'Dani in a warm hatch', base: 'Hot Hatch 2.0T', target: 16.9, fee: 200, prize: 1800 }),
    EV(0, 'four', { name: 'Four-Banger Shootout', rival: 'The Boost Brothers', base: 'Hot Hatch 2.0T', target: 16.5, fee: 250, prize: 2200, req: { maxCyl: 4 } }),
    EV(0, 'oldschool', { name: 'No-Boost Night', rival: 'Grandpa Earl’s big block', base: 'Muscle V8 6.2', target: 16.2, fee: 300, prize: 2400, req: { na: true } }),
    EV(0, 'boss0', { name: 'STREET KING: Big Mike', rival: 'Big Mike’s blown Nova', base: 'Supercharged V8 6.2', target: 15.4, fee: 500, prize: 6000, boss: true, flavor: 'Beat him and the Club scene opens up.' }),

    EV(1, 'testtune', { name: 'Club Test & Tune', rival: 'Club regular', base: 'JDM Twin-Turbo I6 3.0', target: 14.9, fee: 400, prize: 3000 }),
    EV(1, 'dyno350', { name: 'Dyno Day: 350 hp', type: 'dyno', target: 350, fee: 500, prize: 3500 }),
    EV(1, 'eighth1', { name: 'Eighth-Mile Shootout', rival: 'Short-track specialist', base: 'Rally Boxer 2.5T', dist: EM, target: 9.4, fee: 500, prize: 3500 }),
    EV(1, 'pump', { name: 'Pump Gas Only', rival: '“93 octane” Tony', base: 'Hot Hatch 2.0T', target: 14.2, fee: 600, prize: 4500, req: { pump: true } }),
    EV(1, 'light', { name: 'Lightweight Class (≤1,350 kg)', rival: 'Featherweight Fiona', base: 'Flat-Plane V8 Supercar', target: 14.0, fee: 600, prize: 4500, req: { maxMass: 1350 } }),
    EV(1, 'boss1', { name: 'CLUB CHAMP: Rina “Redline” Sato', rival: 'Rina’s rotary', base: 'Twin-Rotor Rotary', target: 13.3, fee: 1200, prize: 12000, boss: true }),

    EV(2, 'prostreet', { name: 'Pro Street Qualifier', rival: 'Pro Street regular', base: 'Supercharged V8 6.2', target: 12.8, fee: 1000, prize: 8000 }),
    EV(2, 'dyno650', { name: 'Dyno Day: 650 hp', type: 'dyno', target: 650, fee: 1200, prize: 9000 }),
    EV(2, 'six', { name: 'Six Cylinders or Fewer', rival: 'Import legend', base: 'JDM Twin-Turbo I6 3.0', target: 12.3, fee: 1400, prize: 11000, req: { maxCyl: 6 } }),
    EV(2, 'eighth2', { name: 'Eighth-Mile Pro', rival: 'Launch-control junkie', base: 'NA V10 Supercar', dist: EM, target: 7.7, fee: 1400, prize: 10000 }),
    EV(2, 'na2', { name: 'Naturally Aspirated Pro', rival: 'High-rev purist', base: 'V12 Grand Tourer', target: 12.6, fee: 1500, prize: 11000, req: { na: true } }),
    EV(2, 'boss2', { name: 'PRO CHAMPS: The Kowalski Twins', rival: 'The Twins’ twin-turbo V8', base: 'Supercharged V8 6.2', target: 11.6, fee: 3000, prize: 30000, boss: true }),

    EV(3, 'invite', { name: 'Elite Invitational', rival: 'Hypercar test driver', base: 'Quad-Turbo W16 Hypercar', target: 11.0, fee: 2500, prize: 20000 }),
    EV(3, 'dyno1000', { name: 'Dyno Day: 1,000 hp', type: 'dyno', target: 1000, fee: 3000, prize: 25000 }),
    EV(3, 'hybrid', { name: 'Hybrid Heat', rival: 'Factory hybrid team', base: 'F1-Style Hybrid V6 1.6T', target: 10.7, fee: 3000, prize: 28000, req: { elec: true } }),
    EV(3, 'small', { name: 'Small Displacement (≤4.0 L)', rival: 'Displacement-is-overrated Dev', base: 'E-Turbo Flat-6 3.6 T-Hybrid', target: 10.5, fee: 3500, prize: 30000, req: { maxDisp: 4.0 } }),
    EV(3, 'eighth3', { name: 'Eighth-Mile Elite', rival: 'Wheelie-bar Wanda', base: 'Pro Mod Drag V8', dist: EM, target: 6.6, fee: 3500, prize: 30000 }),
    EV(3, 'boss3', { name: 'ELITE CHAMP: Vex', rival: 'Vex’s hypercar', base: 'Quad-Turbo W16 Hypercar', target: 10.0, fee: 8000, prize: 80000, boss: true }),

    EV(4, 'exhib', { name: 'Legend Exhibition', rival: 'Hall-of-famer', base: 'Pro Mod Drag V8', target: 9.6, fee: 6000, prize: 50000 }),
    EV(4, 'dyno1500', { name: 'Dyno Day: 1,500 hp', type: 'dyno', target: 1500, fee: 7000, prize: 60000 }),
    EV(4, 'fourleg', { name: 'Four-Cylinder Legend', rival: 'The 2.0-liter madman', base: 'Hot Hatch 2.0T', target: 9.7, fee: 8000, prize: 70000, req: { maxCyl: 4 } }),
    EV(4, 'eighth4', { name: 'Eighth-Mile Legend', rival: 'Pro Mod veteran', base: 'Pro Mod Drag V8', dist: EM, target: 6.0, fee: 8000, prize: 70000 }),
    EV(4, 'final', { name: 'FINAL BOSS: Doc Torque', rival: 'Doc Torque’s Pro Mod', base: 'Pro Mod Drag V8', target: 8.6, fee: 15000, prize: 250000, boss: true, final: true, flavor: 'The man who taught everyone. Beat him and you are a Legend.' }),
  ];
  const BOSS_UNLOCK_WINS = 3;

  function checkReq(req, c, an) {
    const out = [];
    const mass = c.chassis + an.mass + 75;
    if (req.maxCyl) out.push({ ok: c.cyl <= req.maxCyl, text: `${req.maxCyl} ${c.layout === 'R' ? 'rotors/cyl.' : 'cylinders'} or fewer` });
    if (req.na) out.push({ ok: c.aspiration === 'na' && !c.nitrous, text: 'Naturally aspirated, no nitrous' });
    if (req.pump) out.push({ ok: ['p87', 'p91', 'p93'].includes(c.fuel), text: 'Pump gas (87–93)' });
    if (req.maxMass) out.push({ ok: mass <= req.maxMass, text: `Car weighs ≤ ${req.maxMass.toLocaleString()} kg (yours: ${Math.round(mass).toLocaleString()})` });
    if (req.maxDisp) out.push({ ok: an.g.dispL <= req.maxDisp + 1e-6, text: `≤ ${req.maxDisp.toFixed(1)} L (yours: ${an.g.dispL.toFixed(2)} L)` });
    if (req.elec) out.push({ ok: c.mguk > 0 || E.hasElec(c), text: 'Hybrid or electric boost fitted' });
    return out;
  }

  function newSave(diff, starterKey) {
    const st = STARTERS[starterKey];
    const cfg = Object.assign({}, PRE.BASE, st.cfg);
    return {
      v: 1, diff, starter: starterKey, cash: DIFFICULTY[diff].cash, tier: 0, wins: {}, cfg,
      baseChassis: cfg.chassis, baseCda: cfg.cda, started: Date.now(),
      stats: { races: 0, wins: 0, blown: 0, earned: 0, best: null }, finished: false,
    };
  }

  root.Career = { DIFFICULTY, TIERS, LOCKS, MAXES, STARTERS, EVENTS, ENGINE_KEYS, BOSS_UNLOCK_WINS, QM, EM,
    lockTier, maxFor, minFor, carValue, value, changeCost, checkReq, newSave };
})(this);
