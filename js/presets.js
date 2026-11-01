/* Build defaults + preset builds */
(function (root) {
  'use strict';
  const BASE = {
    name: 'My Engine',
    layout: 'I', cyl: 4, vAngle: 90, crank: 'cross', bore: 86, stroke: 86, rotorCC: 654,
    block: 'alu', internals: 'cast', flywheel: 'stock',
    valvetrain: 'DOHC', springs: 'stock', vvt: 'intake', cam: 35, cr: 10.5, redline: 7000,
    aspiration: 'na', turboCount: 1, turboSize: 52, turbineAR: 'med', boost: 14, intercooler: 'air', bov: true, antilag: false,
    eturbo: false, eturboKw: 12, escKw: 7,
    intake: 'stock', runner: 50,
    fuel: 'p91', injector: 360, lambda: 0.88, timing: 0, knockControl: true, pops: 'off', popStyle: 'crackle', nitrous: 0,
    exhaust: 'stock', headers: 'equal',
    mguk: 0, battery: 0,
    brakes: 'stock', pads: 'street', fluid: 'dot4', brakeBias: 66, abs: true, brakeDucts: false, chute: false,
    chassis: 1250, drivetrain: 'FWD', tires: 'perf', gears: 6, gearbox: 'manual', gearing: 50, cda: 0.68, launchRpm: 3500,
    straightCut: false,
  };
  const P = (name, desc, o) => ({ name, desc, cfg: Object.assign({}, BASE, { name }, o) });
  const PRESETS = [
    P('Econo Box I4 1.6', 'Humble commuter four. A blank canvas.', {
      cyl: 4, bore: 79, stroke: 81.5, valvetrain: 'SOHC', vvt: 'none', cam: 15, cr: 10.2, redline: 6400, fuel: 'p87', injector: 220,
      chassis: 1080, drivetrain: 'FWD', tires: 'street', gears: 5, cda: 0.64, launchRpm: 2800,
    }),
    P('Turbo Triple 1.0', 'Tiny three-pot with a tiny turbo. Thrummy and frugal.', {
      cyl: 3, bore: 71.9, stroke: 82, valvetrain: 'DOHC', vvt: 'dual', cam: 15, cr: 10, redline: 6300, fuel: 'p87',
      aspiration: 'turbo', turboSize: 38, turbineAR: 'small', boost: 13, injector: 300, internals: 'hyper',
      chassis: 1050, drivetrain: 'FWD', tires: 'street', gears: 6, cda: 0.62, launchRpm: 2600,
    }),
    P('Hot Hatch 2.0T', 'Modern turbo four. Torquey, punchy, tunable.', {
      cyl: 4, bore: 86, stroke: 86, valvetrain: 'DOHC', vvt: 'dual', cam: 30, cr: 9.6, redline: 6800, fuel: 'p93',
      aspiration: 'turbo', turboSize: 50, turbineAR: 'small', boost: 22, injector: 480, internals: 'forged', exhaust: 'sport', intake: 'cai',
      chassis: 1330, drivetrain: 'FWD', tires: 'perf', gears: 7, gearbox: 'dct', cda: 0.66, launchRpm: 3800,
      brakes: 'sport', pads: 'perf',
    }),
    P('JDM Twin-Turbo I6 3.0', 'Iron-block legend-style straight six. Begging for boost.', {
      cyl: 6, bore: 86, stroke: 86, block: 'iron', internals: 'forged', valvetrain: 'DOHC', vvt: 'intake', cam: 40, cr: 8.5, redline: 7000,
      aspiration: 'turbo', turboCount: 2, turboSize: 46, turbineAR: 'small', boost: 14, fuel: 'p93', injector: 550, exhaust: 'sport',
      chassis: 1360, drivetrain: 'RWD', tires: 'perf', gears: 6, cda: 0.64, launchRpm: 4000,
    }),
    P('Rally Boxer 2.5T', 'Unequal-length headers = that burble.', {
      layout: 'F', cyl: 4, bore: 99.5, stroke: 79, valvetrain: 'DOHC', vvt: 'dual', cam: 30, cr: 8.2, redline: 6700,
      aspiration: 'turbo', turboSize: 54, boost: 16, injector: 560, headers: 'unequal', fuel: 'p93', exhaust: 'sport', internals: 'hyper',
      chassis: 1430, drivetrain: 'AWD', tires: 'perf', gears: 6, cda: 0.7, launchRpm: 4200,
    }),
    P('Muscle V8 6.2', 'Cross-plane pushrod V8. Lope, rumble, torque.', {
      layout: 'V', cyl: 8, vAngle: 90, crank: 'cross', bore: 103.25, stroke: 92, valvetrain: 'OHV', vvt: 'intake', cam: 40, cr: 11.5,
      redline: 6600, fuel: 'p91', injector: 420, exhaust: 'sport', internals: 'hyper', springs: 'uprated', intake: 'cai',
      chassis: 1580, drivetrain: 'RWD', tires: 'perf', gears: 6, cda: 0.74, launchRpm: 3000,
    }),
    P('Supercharged V8 6.2', 'Twin-screw blower whine on top of the rumble.', {
      layout: 'V', cyl: 8, vAngle: 90, crank: 'cross', bore: 103.25, stroke: 92, valvetrain: 'OHV', vvt: 'intake', cam: 30, cr: 10,
      redline: 6500, fuel: 'p93', injector: 640, exhaust: 'header', internals: 'forged', springs: 'uprated',
      aspiration: 'sc_screw', boost: 12, intercooler: 'water',
      chassis: 1700, drivetrain: 'RWD', tires: 'radial', gears: 8, gearbox: 'auto', cda: 0.76, launchRpm: 2500,
      brakes: 'bbk', pads: 'perf',
    }),
    P('Flat-Plane V8 Supercar', 'Shrieking 9000 rpm Italian-style V8.', {
      layout: 'V', cyl: 8, vAngle: 90, crank: 'flat', bore: 94, stroke: 81, valvetrain: 'DOHC', vvt: 'dual', cam: 70, cr: 12.5, springs: 'uprated',
      redline: 9000, fuel: 'p93', injector: 500, exhaust: 'header', internals: 'forged', intake: 'cai', runner: 40,
      chassis: 1320, drivetrain: 'RWD', tires: 'semi', gears: 7, gearbox: 'dct', cda: 0.66, launchRpm: 4500,
      brakes: 'ccm', pads: 'perf', fluid: 'dot51',
    }),
    P('NA V10 Supercar', 'Ten cylinders, wailing to 8700.', {
      layout: 'V', cyl: 10, vAngle: 90, bore: 84.5, stroke: 92.8, valvetrain: 'DOHC', vvt: 'dual', cam: 62, cr: 12.7, springs: 'uprated',
      redline: 8700, fuel: 'p93', injector: 420, exhaust: 'header', internals: 'forged', intake: 'cai',
      chassis: 1400, drivetrain: 'AWD', tires: 'semi', gears: 7, gearbox: 'dct', cda: 0.68, launchRpm: 4500,
      brakes: 'ccm', pads: 'perf', fluid: 'dot51',
    }),
    P('V12 Grand Tourer', 'Silky 65° V12 that screams to 9500.', {
      layout: 'V', cyl: 12, vAngle: 65, bore: 94, stroke: 78, valvetrain: 'DOHC', vvt: 'dual', cam: 70, cr: 13.5, springs: 'uprated',
      redline: 9300, fuel: 'p93', injector: 460, exhaust: 'header', internals: 'forged', intake: 'itb', runner: 40,
      chassis: 1450, drivetrain: 'RWD', tires: 'semi', gears: 7, gearbox: 'dct', cda: 0.7, launchRpm: 4500,
      brakes: 'ccm', pads: 'perf', fluid: 'dot51',
    }),
    P('E-Turbo Flat-6 3.6 T-Hybrid', 'Boxer six with a motor-assisted e-turbo: big-turbo power, zero lag.', {
      layout: 'F', cyl: 6, bore: 97, stroke: 81, valvetrain: 'DOHC', vvt: 'dual', cam: 45, cr: 10.5, redline: 7500, springs: 'uprated',
      aspiration: 'turbo', turboSize: 54, turbineAR: 'med', boost: 8, intercooler: 'air', eturbo: true, eturboKw: 11,
      fuel: 'p93', injector: 520, internals: 'forged', exhaust: 'sport', intake: 'cai',
      chassis: 1420, drivetrain: 'RWD', tires: 'semi', gears: 8, gearbox: 'dct', cda: 0.62, launchRpm: 4000,
      brakes: 'bbk', pads: 'perf',
    }),
    P('E-Supercharged I6 3.0 (48V)', 'Luxury-SUV straight six: 48 V e-supercharger in series with a twin-scroll turbo.', {
      cyl: 6, bore: 83, stroke: 92.3, valvetrain: 'DOHC', vvt: 'dual', cam: 25, cr: 10.5, redline: 6500,
      aspiration: 'esc_turbo', turboSize: 50, turbineAR: 'small', boost: 20, escKw: 6, intercooler: 'water',
      fuel: 'p93', injector: 450, internals: 'forged', exhaust: 'stock',
      chassis: 2100, drivetrain: 'AWD', tires: 'perf', gears: 8, gearbox: 'auto', cda: 1.05, launchRpm: 2200,
    }),
    P('Twin-Rotor Rotary', 'Brap brap. Sequential-style turbo two-rotor.', {
      layout: 'R', cyl: 2, rotorCC: 654, cam: 40, cr: 9, redline: 8000, aspiration: 'turbo', turboSize: 48, boost: 11, turbineAR: 'small',
      fuel: 'p93', injector: 550, exhaust: 'sport',
      chassis: 1220, drivetrain: 'RWD', tires: 'perf', gears: 5, cda: 0.62, launchRpm: 4500,
    }),
    P('V-Twin Cruiser 1.9', '45° big twin. Potato-potato.', {
      layout: 'V', cyl: 2, vAngle: 45, bore: 102, stroke: 114.3, valvetrain: 'OHV', vvt: 'none', cam: 25, cr: 10, redline: 5500, block: 'alu',
      fuel: 'p91', injector: 330, exhaust: 'straight', intake: 'cai',
      chassis: 260, drivetrain: 'RWD', tires: 'street', gears: 6, cda: 0.55, launchRpm: 2500,
    }),
    P('Superbike I4 1.0', '14,000 rpm inline four. Pure scream.', {
      cyl: 4, bore: 76, stroke: 55, valvetrain: 'DOHC', springs: 'race', vvt: 'none', cam: 88, cr: 13.2, redline: 14000, intake: 'itb', runner: 25,
      fuel: 'p93', injector: 300, exhaust: 'header', internals: 'forged', flywheel: 'ultra',
      chassis: 120, drivetrain: 'RWD', tires: 'semi', gears: 6, gearbox: 'seq', cda: 0.4, launchRpm: 8000,
      brakes: 'race', pads: 'perf',
    }),
    P('F1-Style Hybrid V6 1.6T', 'Tiny turbo V6 + 120 kW MGU-K. 15,000 rpm.', {
      layout: 'V', cyl: 6, vAngle: 90, bore: 80, stroke: 53, valvetrain: 'PNEU', vvt: 'none', cam: 80, cr: 14, redline: 15000,
      aspiration: 'turbo', turboSize: 62, turbineAR: 'med', boost: 34, intercooler: 'water', fuel: 'race', injector: 900,
      internals: 'billet', exhaust: 'straight', intake: 'itb', flywheel: 'ultra', lambda: 0.95, mguk: 120, battery: 4000,
      chassis: 600, drivetrain: 'RWD', tires: 'slick', gears: 8, gearbox: 'seq', cda: 1.1, launchRpm: 10000, straightCut: true,
      brakes: 'race', pads: 'race', fluid: 'race', brakeDucts: true, abs: false, brakeBias: 58,
    }),
    P('Quad-Turbo W16 Hypercar', 'Sixteen cylinders, four turbos, 1500+ hp.', {
      layout: 'W', cyl: 16, bore: 86, stroke: 86, valvetrain: 'DOHC', vvt: 'intake', cam: 40, cr: 9, redline: 6800,
      aspiration: 'turbo', turboCount: 4, turboSize: 56, boost: 26, intercooler: 'water', fuel: 'race', injector: 700,
      internals: 'forged', exhaust: 'sport', intake: 'cai',
      chassis: 1600, drivetrain: 'AWD', tires: 'semi', gears: 7, gearbox: 'dct', cda: 0.72, launchRpm: 3500,
      brakes: 'ccm', pads: 'perf', fluid: 'dot51',
    }),
    P('Pro Mod Drag V8', 'Methanol, twin 88s, billet everything. Unhinged.', {
      layout: 'V', cyl: 8, crank: 'cross', bore: 117, stroke: 101.6, valvetrain: 'OHV', springs: 'race', vvt: 'none', cam: 85, cr: 10,
      redline: 7600, runner: 10, aspiration: 'turbo', turboCount: 2, turboSize: 88, turbineAR: 'large', boost: 38, intercooler: 'none', antilag: true,
      fuel: 'meth', injector: 2400, lambda: 0.8, internals: 'billet', exhaust: 'straight', intake: 'cai', block: 'alu', pops: 'aggressive', popStyle: 'bang',
      chassis: 1030, drivetrain: 'RWD', tires: 'slick', gears: 5, gearbox: 'auto', cda: 0.6, launchRpm: 5500, straightCut: true,
      brakes: 'race', pads: 'race', fluid: 'race', chute: true, brakeBias: 60,
    }),
  ];
  const api = { BASE, PRESETS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EnginePresets = api;
})(this);
