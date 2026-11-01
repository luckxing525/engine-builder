/* =====================================================================
   TORQUESMITH — app: parts UI, live analysis, engine sim, dyno, drag,
   garage and challenges.
   ===================================================================== */
(function () {
  'use strict';
  const E = EnginePhysics, PRE = EnginePresets;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- state ---------------- */
  const startPreset = PRE.PRESETS.find(p => p.name === 'Muscle V8 6.2');
  const state = {
    cfg: Object.assign({}, startPreset.cfg),
    fromPreset: startPreset.name,
    an: null, base: null,
    unitP: LS.get('ts.unitP', 'hp'), unitT: LS.get('ts.unitT', 'Nm'),
    partTab: 'block', view: 'dyno', aux: 'boost',
    lastDrag: null,
    blownCount: LS.get('ts.blown', 0),
    done: LS.get('ts.done', {}),
  };

  const PU = { hp: w => w / 745.7, kW: w => w / 1000, PS: w => w / 735.5 };
  const TU = { Nm: t => t, lbft: t => t / 1.35582 };
  const TL = { Nm: 'Nm', lbft: 'lb-ft' };
  const fmtP = (w) => Math.round(PU[state.unitP](w)).toLocaleString();
  const fmtT = (t) => Math.round(TU[state.unitT](t)).toLocaleString();
  const hpOf = (w) => w / 745.7;
  const metric = () => state.unitP !== 'hp';

  /* ---------------- controls schema ---------------- */
  const CYL = { I: [1, 2, 3, 4, 5, 6], V: [2, 4, 6, 8, 10, 12, 16], F: [2, 4, 6], W: [8, 12, 16], R: [1, 2, 3, 4] };
  const isR = c => c.layout === 'R';
  const boosted = c => c.aspiration !== 'na';
  const turbo = c => c.aspiration === 'turbo' || c.aspiration === 'twin' || c.aspiration === 'esc_turbo';
  const escOn = c => c.aspiration === 'esc' || c.aspiration === 'esc_turbo';
  const camWord = v => v < 20 ? 'Economy' : v < 40 ? 'Street' : v < 60 ? 'Sport' : v < 80 ? 'Race' : 'Full race';
  const TABS = [
    ['block', 'Block', '<path d="M4 7h16v10H4z M7 7V4h10v3 M8 17v3 M16 17v3" fill="none" stroke="currentColor" stroke-width="1.6"/>'],
    ['head', 'Head & cams', '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 5c4 0 5 4 5 7" fill="none" stroke="currentColor" stroke-width="1.6"/>'],
    ['induction', 'Induction', '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 4c-3 4 3 4 0 8s3 4 0 8M4 12c4-3 4 3 8 0s4 3 8 0" fill="none" stroke="currentColor" stroke-width="1.3"/>'],
    ['tune', 'Fuel & tune', '<path d="M6 20V8l4-4h6v16zM16 9h2l1 2v6a1.5 1.5 0 0 0 3 0V8l-2-2" fill="none" stroke="currentColor" stroke-width="1.6"/>'],
    ['exhaust', 'Exhaust', '<path d="M3 9h7l3 3h8v4h-9l-3-3H3z" fill="none" stroke="currentColor" stroke-width="1.6"/>'],
    ['hybrid', 'Hybrid & NOS', '<path d="M13 3L5 14h6l-1 7 8-11h-6z" fill="none" stroke="currentColor" stroke-width="1.6"/>'],
    ['brakes', 'Brakes', '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 9a8 8 0 0 1 5-5" fill="none" stroke="currentColor" stroke-width="3"/>'],
    ['car', 'Car', '<path d="M3 15l2-5h14l2 5v3H3zM7 10l2-4h6l2 4" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>'],
  ];

  const CONTROLS = [
    // BLOCK
    { tab: 'block', id: 'layout', label: 'Layout', type: 'seg', options: [['I', 'Inline'], ['V', 'V'], ['F', 'Boxer'], ['W', 'W'], ['R', 'Rotary']],
      hint: c => ({ I: 'Cylinders in a row. Simple, smooth (I6 is perfectly balanced).', V: 'Two banks sharing a crank. Compact for many cylinders.', F: 'Horizontally opposed. Low center of gravity, famous burble.', W: 'Four narrow banks — how you fit 16 cylinders in a car.', R: 'Wankel rotary: triangular rotors, no pistons, sky-high revs.' })[c.layout] },
    { tab: 'block', id: 'cyl', label: c => isR(c) ? 'Rotors' : 'Cylinders', type: 'seg', options: c => CYL[c.layout].map(n => [n, String(n)]) },
    { tab: 'block', id: 'vAngle', label: 'Bank angle', type: 'seg', show: c => c.layout === 'V', options: [[45, '45°'], [60, '60°'], [65, '65°'], [72, '72°'], [90, '90°'], [120, '120°']],
      hint: c => c.cyl === 2 ? 'On a V-twin the bank angle sets the uneven firing gap — 45° gives the classic potato-potato.' : 'Mostly packaging & balance here; V-twins care most.' },
    { tab: 'block', id: 'crank', label: 'Crankshaft', type: 'seg', show: c => c.layout === 'V' && c.cyl === 8, options: [['cross', 'Cross-plane'], ['flat', 'Flat-plane']],
      hint: c => c.crank === 'cross' ? 'Uneven firing per bank = the deep American burble.' : 'Alternating banks = a high-pitched race-car shriek. Revs quicker.' },
    { tab: 'block', id: 'bore', label: 'Bore', type: 'range', min: 50, max: 125, step: 0.5, unit: 'mm', show: c => !isR(c) },
    { tab: 'block', id: 'stroke', label: 'Stroke', type: 'range', min: 38, max: 125, step: 0.5, unit: 'mm', show: c => !isR(c),
      hint: c => { const r = c.bore / c.stroke; return r > 1.1 ? 'Oversquare: short stroke loves to rev.' : r < 0.95 ? 'Undersquare: long stroke makes low-end torque, hates rpm.' : 'Square: balanced torque and revs.'; } },
    { tab: 'block', id: 'rotorCC', label: 'Chamber volume (per rotor)', type: 'range', min: 300, max: 1000, step: 2, unit: 'cc', show: isR },
    { tab: 'block', id: 'block', label: 'Block material', type: 'seg', show: c => !isR(c), options: [['iron', 'Cast iron'], ['alu', 'Aluminum']],
      hint: c => c.block === 'iron' ? 'Heavy but strong — handles big boost.' : 'Light, but slightly less stout under huge cylinder pressure.' },
    { tab: 'block', id: 'internals', label: c => isR(c) ? 'Rotor & seal grade' : 'Rods & pistons', type: 'seg', options: [['cast', 'Cast'], ['hyper', 'Hyper'], ['forged', 'Forged'], ['billet', 'Billet']],
      hint: c => ({ cast: 'Cheap OEM parts. Fine for mild builds.', hyper: 'Hypereutectic pistons: a bit tougher.', forged: 'Forged pistons & H-beam rods. The boost go-to.', billet: 'Billet everything. Race money.' })[c.internals] },
    { tab: 'block', id: 'flywheel', label: 'Flywheel', type: 'seg', options: [['stock', 'Stock'], ['light', 'Lightened'], ['ultra', 'Featherweight']], hint: () => 'Lighter = snappier revs in free-rev mode.' },
    // HEAD
    { tab: 'head', id: 'valvetrain', label: 'Valvetrain', type: 'seg', show: c => !isR(c), options: [['OHV', 'OHV 2V'], ['SOHC', 'SOHC'], ['DOHC', 'DOHC 4V'], ['PNEU', 'Pneumatic']],
      hint: c => ({ OHV: 'Pushrods: compact and torquey, but valve float limits rpm.', SOHC: 'Single overhead cam, 2 valves.', DOHC: 'Twin cams, 4 valves: breathes well, revs high.', PNEU: 'F1-style air springs. 15,000+ rpm. Very expensive.' })[c.valvetrain] },
    { tab: 'head', id: 'springs', label: 'Valve springs', type: 'seg', show: c => !isR(c), options: [['stock', 'Stock'], ['uprated', 'Uprated'], ['race', 'Race + Ti valves']],
      fmt: c => `floats ~${(Math.round(E.valveFloat(c) / 100) * 100).toLocaleString()} rpm` },
    { tab: 'head', id: 'vvt', label: 'Variable valve timing', type: 'seg', show: c => !isR(c), options: [['none', 'None'], ['intake', 'Intake cam'], ['dual', 'Dual cam'], ['lift', 'Cam switching']],
      hint: () => 'Widens the powerband. Cam switching swaps to a wild lobe up top.' },
    { tab: 'head', id: 'cam', label: c => isR(c) ? 'Port timing' : 'Camshaft profile', type: 'range', min: 0, max: 100, step: 1, fmt: c => camWord(c.cam),
      hint: c => isR(c) ? 'Street port → bridge port → peripheral port. Wilder = more top end, rougher idle.' : 'More duration & lift: power moves up the rev range, idle gets lumpy.' },
    { tab: 'head', id: 'cr', label: 'Compression ratio', type: 'range', min: 7, max: 16, step: 0.1, fmt: c => c.cr.toFixed(1) + ':1',
      hint: () => 'Higher = more efficient & more power, but needs better fuel (knock).' },
    { tab: 'head', id: 'redline', label: 'Rev limiter', type: 'range', min: 3000, max: c => E.revCeiling(c).rpm, step: 100, fmt: c => c.redline.toLocaleString() + ' rpm',
      hint: c => { const k = E.revCeiling(c); return `This engine physically tops out at <b>${k.rpm.toLocaleString()} rpm</b> (limited by ${k.by}). To rev higher: ${k.fix}.`; } },
    { tab: 'head', id: 'intake', label: 'Intake', type: 'seg', options: [['stock', 'Stock airbox'], ['cai', 'Cold air'], ['itb', 'Individual throttles']],
      hint: c => c.intake === 'itb' ? 'One throttle per cylinder: sharp response, big induction howl.' : '' },
    { tab: 'head', id: 'runner', label: 'Intake runner length', type: 'range', min: 0, max: 100, step: 1, fmt: c => c.runner < 35 ? 'Short' : c.runner > 65 ? 'Long' : 'Medium',
      hint: () => 'Long runners tune for low-rpm torque, short ones for top-end.' },
    // INDUCTION
    { tab: 'induction', id: 'aspiration', label: 'Aspiration', type: 'select', options: Object.entries(E.ASPIRATION) },
    { tab: 'induction', id: 'turboCount', label: 'Turbochargers', type: 'seg', show: c => c.aspiration === 'turbo', options: [[1, 'Single'], [2, 'Twin'], [4, 'Quad']] },
    { tab: 'induction', id: 'turboSize', label: 'Compressor inducer', type: 'range', min: 34, max: 100, step: 1, unit: 'mm', show: turbo,
      fmt: c => `~${Math.round(0.0175 * c.turboSize * c.turboSize * 10 * (c.aspiration === 'twin' ? 1 : c.turboCount))} hp capable`,
      hint: () => 'Bigger turbo = more top-end flow, but more lag and a later spool.' },
    { tab: 'induction', id: 'turbineAR', label: 'Turbine housing A/R', type: 'seg', show: turbo, options: [['small', '0.63 (quick)'], ['med', '0.82'], ['large', '1.06 (flow)']] },
    { tab: 'induction', id: 'boost', label: 'Boost target', type: 'range', min: 0, max: 50, step: 0.5, show: boosted,
      fmt: c => metric() ? (c.boost * 0.0689476).toFixed(2) + ' bar' : c.boost.toFixed(1) + ' psi' },
    { tab: 'induction', id: 'intercooler', label: 'Intercooler', type: 'seg', show: boosted, options: [['none', 'None'], ['air', 'Air-to-air'], ['water', 'Water-to-air']],
      hint: () => 'Cools the compressed charge: denser air, less knock.' },
    { tab: 'induction', id: 'bov', label: 'Blow-off valve', type: 'toggle', show: turbo, hint: c => c.bov ? 'Pssssh on lift-off.' : 'No BOV: compressor surge flutter (stu-tu-tu).' },
    { tab: 'induction', id: 'eturbo', label: 'Electric turbo (e-turbo)', type: 'toggle', show: c => c.aspiration === 'turbo' || c.aspiration === 'esc_turbo',
      hint: c => c.eturbo ? 'A motor on the turbo shaft spins it up instantly — big-turbo power with no lag. Off-throttle and at high rpm it flips to a generator and harvests exhaust energy.' : 'Like the 911 Turbo S T-Hybrid, AMG and F1 (MGU-H): an electric motor built into the turbo itself.' },
    { tab: 'induction', id: 'eturboKw', label: 'E-turbo motor power', type: 'range', min: 3, max: 120, step: 1, unit: 'kW', show: c => c.eturbo && (c.aspiration === 'turbo' || c.aspiration === 'esc_turbo'),
      fmt: c => { const a = state.an; return a && a.eDrawMax > 0 ? `uses up to ${a.eDrawMax.toFixed(1)} kW` : 'standby'; },
      hint: () => 'Road-car e-turbos are ~10–15 kW on 400 V; F1 MGU-H units were 120 kW. Extra power only helps if the turbo needs it.' },
    { tab: 'induction', id: 'escKw', label: 'E-supercharger motor power', type: 'range', min: 2, max: 40, step: 1, unit: 'kW', show: escOn,
      fmt: c => { const a = state.an; return a ? `uses up to ${a.eDrawMax.toFixed(1)} kW` : ''; },
      hint: c => c.aspiration === 'esc' ? 'A compressor spun by an electric motor (48 V). Boost is limited by motor power: plenty at low rpm, fading up top where the engine gulps more air.' : 'In series with the turbo, like the Range Rover / Audi SQ7 setups: the e-supercharger fills boost instantly until the turbo spools, then bypasses.' },
    { tab: 'induction', id: 'antilag', label: 'Anti-lag system', type: 'toggle', show: turbo, hint: () => 'Keeps the turbo spinning off-throttle with fuel in the exhaust. Bangs. Hurts reliability.' },
    // TUNE
    { tab: 'tune', id: 'fuel', label: 'Fuel', type: 'select', options: Object.entries(E.FUELS).map(([k, f]) => [k, `${f.name} (${f.octane} octane-equiv.)`]),
      hint: c => c.fuel === 'e85' || c.fuel === 'meth' ? 'Alcohol fuels cool the charge and resist knock, but need much bigger injectors.' : '' },
    { tab: 'tune', id: 'injector', label: 'Injector size', type: 'range', min: 150, max: 2600, step: 10, unit: 'cc/min',
      fmt: c => { const d = state.an ? Math.max.apply(null, state.an.pts.map(p => p.injDuty)) : 0; return `${Math.round(d * 100)}% duty`; },
      hint: () => 'Over 100% duty the engine runs lean. Lean = hot = broken.' },
    { tab: 'tune', id: 'lambda', label: 'Target air-fuel ratio', type: 'range', min: 0.7, max: 1.1, step: 0.01,
      fmt: c => `λ ${c.lambda.toFixed(2)} · ${(c.lambda * E.FUELS[c.fuel].stoich).toFixed(1)}:1`, hint: () => 'Best power around λ 0.86–0.90. Richer runs cooler, leaner runs hotter.' },
    { tab: 'tune', id: 'timing', label: 'Ignition timing', type: 'range', min: -10, max: 8, step: 0.5,
      fmt: c => (c.timing > 0 ? '+' : '') + c.timing.toFixed(1) + '° vs MBT map', hint: () => 'Advance makes power until knock. Retard is safe but slow and hot.' },
    { tab: 'tune', id: 'knockControl', label: 'Knock sensor protection', type: 'toggle', hint: c => c.knockControl ? 'ECU pulls timing when it hears knock.' : 'DANGER: no protection. Detonation will hurt it.' },
    { tab: 'tune', id: 'pops', label: 'Pops & bangs map', type: 'seg', options: [['off', 'Off'], ['mild', 'Mild'], ['aggressive', 'Aggressive']], hint: () => 'Fuel on overrun so the exhaust crackles on lift-off.' },
    { tab: 'tune', id: 'popStyle', label: 'Pop & bang sound', type: 'seg', options: [['crackle', 'Crackle'], ['bang', 'Gunshot'], ['burble', 'Burble'], ['spit', 'Spitfire']], action: ['poptest', '▶ Test pop'],
      hint: c => ({ crackle: 'Sharp, dry crackles with a little trailing sizzle — modern hot-hatch / AMG-tune style.', bang: 'Huge single cannon shots with a slap-back echo — rally anti-lag and race cars.', burble: 'Rounder, muffled "blub-blub" pops through the mufflers — big V8 overrun burble.', spit: 'Rapid machine-gun spitting of tiny cracks — high-strung supercar / race exhaust.' })[c.popStyle] },
    // EXHAUST
    { tab: 'exhaust', id: 'exhaust', label: 'Exhaust system', type: 'seg', options: [['stock', 'Stock'], ['sport', 'Sport cat-back'], ['header', 'Headers + hi-flow'], ['straight', 'Straight pipe']],
      hint: c => ({ stock: 'Quiet, restrictive.', sport: 'Free-flowing muffler, more voice.', header: 'Tuned headers + high-flow cat. Loud and raspy.', straight: 'No muffler, no cat. Not road legal anywhere nice.' })[c.exhaust] },
    { tab: 'exhaust', id: 'headers', label: 'Header design', type: 'seg', options: [['equal', 'Equal length'], ['unequal', 'Unequal length']], show: c => c.layout === 'F',
      hint: () => 'Unequal headers on a boxer = the rally burble.' },
    // HYBRID
    { tab: 'hybrid', id: 'mguk', label: 'MGU-K / KERS motor', type: 'range', min: 0, max: 400, step: 5, unit: 'kW', fmt: c => c.mguk ? `${Math.round(c.mguk * 1.341)} hp` : 'None',
      hint: () => 'Electric motor on the crank. Instant torque that fills the turbo-lag hole.' },
    { tab: 'hybrid', id: 'battery', label: 'Energy store', type: 'range', min: 0, max: 10000, step: 100, unit: 'kJ', show: c => c.mguk > 0,
      fmt: c => `${(c.battery / 3600).toFixed(2)} kWh`, hint: () => 'How long the boost lasts in a drag run. 400 kJ ≈ old KERS; 4 MJ ≈ modern F1.' },
    { tab: 'hybrid', id: 'nitrous', label: 'Nitrous shot', type: 'range', min: 0, max: 500, step: 25, unit: 'hp', fmt: c => c.nitrous ? `+${c.nitrous} hp wet` : 'Off',
      hint: () => 'Activates above 3,000 rpm. Huge hit, huge cylinder pressure.' },
    // BRAKES
    { tab: 'brakes', id: 'brakes', label: 'Brake package', type: 'select', options: Object.entries(E.BRAKES).map(([k, b]) => [k, b.name]),
      hint: c => ({ stock: 'Single-piston sliding calipers on iron rotors. Fine for the street, fades fast on track.', sport: 'Four-piston fixed calipers, bigger vented rotors.', bbk: 'Six-piston calipers on big two-piece rotors: more torque and much more heat capacity.', race: 'Mono-block race calipers with cooling. Built to be abused.', ccm: 'Carbon-ceramic: huge, light (−13 kg unsprung), and almost fade-proof — but pricey.' })[c.brakes] },
    { tab: 'brakes', id: 'pads', label: 'Pad compound', type: 'seg', options: [['street', 'Street'], ['perf', 'Performance'], ['race', 'Race']],
      hint: c => ({ street: 'Quiet, bite well cold, fade above ~380 °C.', perf: 'More bite, fade-resistant to ~540 °C. Need a little warmth.', race: 'Massive bite once hot (260 °C+), useless cold, fade-proof to ~780 °C.' })[c.pads] },
    { tab: 'brakes', id: 'fluid', label: 'Brake fluid', type: 'seg', options: [['dot4', 'DOT 4'], ['dot51', 'DOT 5.1'], ['race', 'Racing']],
      hint: c => `Boils at ${E.FLUIDS[c.fluid].boil} °C. Boiling fluid = a long, soft pedal and half the stopping power.` },
    { tab: 'brakes', id: 'brakeBias', label: 'Brake bias (front)', type: 'range', min: 45, max: 85, step: 1, fmt: c => `${c.brakeBias}% front`,
      hint: () => 'Braking shifts weight forward, so most of the work belongs at the front (~62–70%). Too far rearward and the rears lock early.' },
    { tab: 'brakes', id: 'abs', label: 'ABS', type: 'toggle', hint: c => c.abs ? 'Anti-lock: stops at the edge of grip and never locks a wheel.' : 'No ABS: full pedal will lock the wheels (smoke, longer stops). Tap the brake to modulate.' },
    { tab: 'brakes', id: 'brakeDucts', label: 'Brake cooling ducts', type: 'toggle', hint: () => 'Force cold air onto the rotors: brakes cool faster between stops.' },
    { tab: 'brakes', id: 'chute', label: 'Drag parachute', type: 'toggle', hint: () => 'Press P above 100 km/h on the 3D track to deploy. Pure drag — no fade, ~1 g from 300 km/h.' },
    // CAR
    { tab: 'car', id: 'chassis', label: 'Chassis weight (no engine)', type: 'range', min: 100, max: 2500, step: 10, unit: 'kg' },
    { tab: 'car', id: 'drivetrain', label: 'Drivetrain', type: 'seg', options: [['FWD', 'FWD'], ['RWD', 'RWD'], ['AWD', 'AWD']] },
    { tab: 'car', id: 'tires', label: 'Tires', type: 'select', options: Object.entries(E.TIRES).map(([k, t]) => [k, `${t.name} (μ ${t.mu})`]) },
    { tab: 'car', id: 'gearbox', label: 'Gearbox', type: 'seg', options: [['manual', 'Manual'], ['auto', 'Auto'], ['dct', 'Dual-clutch'], ['seq', 'Sequential']] },
    { tab: 'car', id: 'gears', label: 'Forward gears', type: 'seg', options: [4, 5, 6, 7, 8, 9, 10].map(n => [n, String(n)]) },
    { tab: 'car', id: 'gearing', label: 'Gearing', type: 'range', min: 0, max: 100, step: 1, fmt: c => c.gearing < 35 ? 'Short (accel)' : c.gearing > 65 ? 'Long (top speed)' : 'Balanced' },
    { tab: 'car', id: 'cda', label: 'Aero drag (CdA)', type: 'range', min: 0.3, max: 1.4, step: 0.01, unit: 'm²' },
    { tab: 'car', id: 'launchRpm', label: 'Launch rpm (2-step)', type: 'range', min: 1500, max: c => Math.max(1600, c.redline - 300), step: 100, fmt: c => c.launchRpm.toLocaleString() + ' rpm' },
    { tab: 'car', id: 'straightCut', label: 'Straight-cut gears', type: 'toggle', hint: () => 'Purely for the race-car whine. Worth it.' },
  ];

  /* ---------------- parts UI ---------------- */
  function renderTabs() {
    $('#partTabs').innerHTML = TABS.map(([id, label, svg]) =>
      `<button data-tab="${id}" class="${state.partTab === id ? 'on' : ''}"><svg viewBox="0 0 24 24" fill="currentColor">${svg}</svg>${label}</button>`).join('');
  }
  $('#partTabs').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.partTab = b.dataset.tab; renderTabs(); renderParts();
  });

  const val = (x, c) => typeof x === 'function' ? x(c) : x;
  function renderParts() {
    const c = state.cfg;
    const html = CONTROLS.filter(k => k.tab === state.partTab && (!k.show || k.show(c))).map(k => {
      const label = val(k.label, c);
      const hint = k.hint ? val(k.hint, c) : '';
      let body = '', shown = '';
      if (k.type === 'seg') {
        body = `<div class="seg">${val(k.options, c).map(([v, l]) => { const lt = lockedTier(k.id, v); return `<button data-id="${k.id}" data-v="${v}" class="${String(c[k.id]) === String(v) ? 'on' : ''} ${lt ? 'locked' : ''}" ${lt ? `title="Unlocks at ${tierName(lt)} tier"` : ''}>${l}${lt ? ' 🔒' : ''}</button>`; }).join('')}</div>`;
        shown = k.fmt ? k.fmt(c) : '';
      } else if (k.type === 'range') {
        const [bmn, bmx] = rangeBounds(k, c);
        body = `<input type="range" data-id="${k.id}" min="${bmn}" max="${bmx}" step="${k.step}" value="${c[k.id]}" aria-label="${esc(label)}">`;
        shown = k.fmt ? k.fmt(c) : `${c[k.id]}${k.unit ? '<small>' + k.unit + '</small>' : ''}`;
        if (k.fmt && k.unit) shown = `${c[k.id]}<small>${k.unit}</small> · ${k.fmt(c)}`;
      } else if (k.type === 'select') {
        body = `<select data-id="${k.id}" aria-label="${esc(label)}">${val(k.options, c).map(([v, l]) => { const lt = lockedTier(k.id, v); return `<option value="${v}" ${c[k.id] === v ? 'selected' : ''} ${lt ? 'disabled' : ''}>${esc(l)}${lt ? ` — 🔒 ${tierName(lt)}` : ''}</option>`; }).join('')}</select>`;
      } else if (k.type === 'toggle') {
        const lt = lockedTier(k.id, !c[k.id]);
        return `<div class="ctl"><label class="switch"><span class="ctl-label">${label}${lt ? ` <span class="lockt">🔒 ${tierName(lt)}</span>` : ''}</span><input type="checkbox" data-id="${k.id}" ${c[k.id] ? 'checked' : ''} ${lt ? 'disabled' : ''}></label>${hint ? `<div class="ctl-hint" data-hint="${k.id}">${hint}</div>` : ''}</div>`;
      }
      if (k.action) body += `<button class="btn small" data-action="${k.action[0]}" style="margin-top:8px">${k.action[1]}</button>`;
      return `<div class="ctl"><div class="ctl-head"><span class="ctl-label">${label}</span><span class="ctl-val" data-val="${k.id}">${shown}</span></div>${body}${hint ? `<div class="ctl-hint" data-hint="${k.id}">${hint}</div>` : ''}</div>`;
    }).join('');
    $('#partBody').innerHTML = (state.partTab === 'brakes' ? brakeCardHTML() : '') + html;
  }
  function brakeCardHTML() {
    const b = E.brakeEstimate(state.cfg, state.an);
    const dist = m => metric() || true ? `${m.toFixed(1)} m` : '';
    return `<div class="brake-card"><div><span>Car weight</span><b>${Math.round(b.mass).toLocaleString()} kg</b></div><div><span>Brake package</span><b style="font-size:12px">${state.cfg.brakes.toUpperCase()} · ${state.cfg.pads}</b></div><div><span>100–0 km/h (cold)</span><b>${dist(b.d100)}</b></div><div><span>200–0 km/h</span><b>${dist(b.d200)}</b></div>
      <div><span>Peak decel</span><b>${b.g.toFixed(2)} g</b></div><div><span>Hard stops from 200 before fade</span><b>${b.stops >= 12 ? '12+' : b.stops}</b></div>
      ${b.locks ? '<p class="bad">Locks the wheels at full pedal (no ABS)</p>' : ''}</div>`;
  }
  function refreshValues() {
    const c = state.cfg;
    CONTROLS.forEach(k => {
      const el = document.querySelector(`[data-val="${k.id}"]`);
      if (el) {
        let shown = k.fmt ? k.fmt(c) : `${c[k.id]}${k.unit ? '<small>' + k.unit + '</small>' : ''}`;
        if (k.type === 'range' && k.fmt && k.unit) shown = `${c[k.id]}<small>${k.unit}</small> · ${k.fmt(c)}`;
        el.innerHTML = shown;
      }
      if (k.type === 'range') {
        const inp = document.querySelector(`input[data-id="${k.id}"]`);
        if (inp) { const [mn, mx] = rangeBounds(k, c); inp.min = mn; inp.max = mx; if (+inp.value !== c[k.id]) inp.value = c[k.id]; }
      }
      const h = document.querySelector(`[data-hint="${k.id}"]`);
      if (h && k.hint) h.innerHTML = val(k.hint, c);
    });
  }

  const partBody = $('#partBody');
  partBody.addEventListener('click', async e => {
    const act = e.target.closest('[data-action]');
    if (act && act.dataset.action === 'poptest') {
      await ensureAudio(); pushSoundConfig();
      setTimeout(() => EngineAudio.event({ type: 'popTest' }), 60);
      return;
    }
    const b = e.target.closest('.seg button'); if (!b) return;
    const k = CONTROLS.find(x => x.id === b.dataset.id);
    const opts = val(k.options, state.cfg);
    const o = opts.find(([v]) => String(v) === b.dataset.v);
    setParam(k.id, o[0], true);
  });
  partBody.addEventListener('input', e => {
    const el = e.target; const id = el.dataset.id; if (!id) return;
    if (el.type === 'range') setParam(id, parseFloat(el.value), false);
  });
  partBody.addEventListener('change', e => {
    const el = e.target; const id = el.dataset.id; if (!id) return;
    if (el.type === 'checkbox') setParam(id, el.checked, true);
    else if (el.tagName === 'SELECT') setParam(id, el.value, true);
  });

  function setParam(id, v, rerender) {
    const c = state.cfg;
    const lt = lockedTier(id, v);
    if (lt) { toast(`🔒 Unlocks at ${tierName(lt)} tier`); renderParts(); return; }
    const kk = CONTROLS.find(x => x.id === id);
    if (kk && kk.type === 'range') { const [mn, mx] = rangeBounds(kk, c); v = clamp(v, mn, mx); }
    const prev = c[id];
    c[id] = v;
    if (id === 'layout' && prev !== v) {
      c.cyl = { I: 4, V: 8, F: 4, W: 16, R: 2 }[v];
      if (v === 'V') c.vAngle = 90;
      if (v === 'R') { c.cam = Math.min(c.cam, 60); c.redline = Math.max(c.redline, 8000); }
      rerender = true;
    }
    if (id === 'cyl' && c.layout === 'V') c.vAngle = { 2: 45, 4: 90, 6: 60, 8: 90, 10: 90, 12: 60, 16: 45 }[v] || 90;
    if (id === 'aspiration' && v !== 'na' && c.boost < 4) c.boost = 10;
    if (id === 'aspiration' && (v === 'twin' || v === 'esc_turbo')) c.turboCount = 1;
    if (id === 'mguk' && v > 0 && !c.battery) { c.battery = 2000; }
    if (id === 'popStyle' && EngineAudio.ready) setTimeout(() => EngineAudio.event({ type: 'popTest' }), 260);
    state.fromPreset = null;
    clampRevs(id !== 'redline');
    scheduleUpdate();
    if (rerender) renderParts(); else refreshValues();
  }

  // keep the limiter (and launch rpm) under what the hardware can survive
  let clampToastT = -1e9;
  function clampRevs(announce) {
    const c = state.cfg, k = E.revCeiling(c);
    if (c.redline > k.rpm) {
      c.redline = k.rpm;
      if (announce && performance.now() - clampToastT > 2500) {
        clampToastT = performance.now();
        toast(`Rev limiter dropped to ${k.rpm.toLocaleString()} rpm — ${k.by} won't allow more`);
      }
    }
    if (c.launchRpm > c.redline - 300) c.launchRpm = Math.max(1500, c.redline - 300);
  }

  /* ---------------- analysis + rendering ---------------- */
  let updQueued = false, sndTimer = null;
  function scheduleUpdate() {
    if (updQueued) return;
    updQueued = true;
    requestAnimationFrame(() => { updQueued = false; update(); });
  }
  function update() {
    state.an = E.analyze(state.cfg);
    renderSummary(); renderTiles(); renderCharts(); renderWarns(); renderTable(); refreshValues();
    $('#buildName').value = state.cfg.name;
    $('#engTitle').textContent = engineLabel(state.cfg, state.an);
    checkChallenges();
    clearTimeout(sndTimer);
    sndTimer = setTimeout(pushSoundConfig, 140);
    renderGearInfo();
    if (inCareer()) { renderCareerBar(); saveCareer(); renderCareer(); }
    if (drv.inited) driveSetup();
    if (state.partTab === 'brakes') { const bc = document.querySelector('.brake-card'); if (bc) bc.outerHTML = brakeCardHTML(); }
  }

  function engineLabel(c, an) {
    const d = an.g.dispL.toFixed(1) + 'L';
    let t;
    if (c.layout === 'I') t = c.cyl === 1 ? 'Single' : c.cyl === 2 ? 'Parallel twin' : 'Inline-' + c.cyl;
    else if (c.layout === 'V') t = c.cyl === 2 ? `${c.vAngle}° V-twin` : 'V' + c.cyl + (c.cyl === 8 ? (c.crank === 'flat' ? ' flat-plane' : ' cross-plane') : '');
    else if (c.layout === 'F') t = 'Flat-' + c.cyl;
    else if (c.layout === 'W') t = 'W' + c.cyl;
    else t = c.cyl + '-rotor';
    const asp = { na: '', turbo: c.turboCount === 2 ? ' twin-turbo' : c.turboCount === 4 ? ' quad-turbo' : ' turbo', sc_roots: ' supercharged', sc_screw: ' supercharged', sc_centri: ' supercharged', twin: ' twincharged' }[c.aspiration];
    return `${d} ${t}${asp}${c.mguk ? ' hybrid' : ''}`;
  }

  function renderSummary() {
    const c = state.cfg, an = state.an;
    const r = isR(c) ? null : c.bore / c.stroke;
    $('#partSummary').innerHTML = `
      <div>Displacement<b>${an.g.dispL.toFixed(2)} L · ${Math.round(an.g.dispL * 61.0237)} ci</b></div>
      <div>${isR(c) ? 'Rotors' : 'Bore/stroke'}<b>${isR(c) ? c.cyl + ' × ' + c.rotorCC + ' cc' : r.toFixed(2) + (r > 1.05 ? ' oversquare' : r < 0.95 ? ' undersquare' : ' square')}</b></div>
      <div>${isR(c) ? 'Apex seal speed' : 'Piston speed @ redline'}<b>${an.vpMax.toFixed(1)} m/s</b></div>
      <div>Idle<b>${an.idle.toLocaleString()} rpm</b></div>
      <div>Rev ceiling<b>${an.ceiling.rpm.toLocaleString()} rpm</b></div>
      <div>Limited by<b>${an.ceiling.by}</b></div>`;
  }

  function delta(cur, base, fmt, invert) {
    if (base == null) return '';
    const d = cur - base;
    if (Math.abs(d) < 1e-6) return '<span class="delta">±0</span>';
    const good = invert ? d < 0 : d > 0;
    return `<span class="delta ${good ? 'up' : 'down'}">${d > 0 ? '▲ +' : '▼ '}${fmt(d)}</span>`;
  }
  function relWord(r) { return r >= 90 ? ['Bulletproof', 'var(--good)'] : r >= 75 ? ['Healthy', 'var(--good)'] : r >= 55 ? ['Stressed', 'var(--warning)'] : r >= 35 ? ['Fragile', 'var(--serious)'] : ['Grenade', 'var(--critical)']; }

  function renderTiles() {
    const an = state.an, b = state.base ? state.base.an : null, c = state.cfg;
    const tiles = [];
    const pu = state.unitP, tu = TL[state.unitT];
    tiles.push(`<div class="tile"><div class="k">Peak power</div><div class="v">${fmtP(an.peakP)}<small>${pu}</small></div><div class="s">@ ${an.rpmP.toLocaleString()} rpm ${delta(PU[pu](an.peakP), b && PU[pu](b.peakP), d => Math.round(Math.abs(d)))}</div></div>`);
    tiles.push(`<div class="tile"><div class="k">Peak torque</div><div class="v">${fmtT(an.peakT)}<small>${tu}</small></div><div class="s">@ ${an.rpmT.toLocaleString()} rpm ${delta(TU[state.unitT](an.peakT), b && TU[state.unitT](b.peakT), d => Math.round(Math.abs(d)))}</div></div>`);
    if (c.mguk) tiles.push(`<div class="tile"><div class="k">Combined w/ hybrid</div><div class="v">${fmtP(an.peakHy)}<small>${pu}</small></div><div class="s">+${fmtP(c.mguk * 1000)} ${pu} electric</div></div>`);
    const [rw, rc] = relWord(an.reliability);
    tiles.push(`<div class="tile"><div class="k">Reliability</div><div class="v">${Math.round(an.reliability)}<small>%</small></div><div class="s">${rw} · ${an.failChance < 0.005 ? '<0.5' : (an.failChance * 100).toFixed(an.failChance < 0.1 ? 1 : 0)}% blow-up risk/pull</div><div class="relbar"><i style="width:${an.reliability}%;background:${rc}"></i></div></div>`);
    tiles.push(`<div class="tile"><div class="k">Specific output</div><div class="v">${Math.round(PU[pu](an.peakP) / an.g.dispL)}<small>${pu}/L</small></div><div class="s">Peak BMEP ${an.bmepMax.toFixed(1)} bar</div></div>`);
    if (an.elec) tiles.push(`<div class="tile"><div class="k">Electric boost</div><div class="v">${an.eDrawMax.toFixed(1)}<small>kW peak</small></div><div class="s">${an.eHarvestMax > 0.1 ? 'harvests up to ' + an.eHarvestMax.toFixed(1) + ' kW' : 'battery-fed (48 V)'}</div></div>`);
    if (an.maxBoost > 0.5) tiles.push(`<div class="tile"><div class="k">Boost</div><div class="v">${metric() ? (an.maxBoost * 0.0689).toFixed(2) : an.maxBoost.toFixed(1)}<small>${metric() ? 'bar' : 'psi'}</small></div><div class="s">${an.spoolRpm ? '90% boost @ ' + an.spoolRpm.toLocaleString() + ' rpm' : 'Never fully spools'}</div></div>`);
    else tiles.push(`<div class="tile"><div class="k" title="rpm range with at least 90% of peak torque">Powerband</div><div class="v" style="font-size:17px">${(an.bandLo / 1000).toFixed(1)}–${(an.bandHi / 1000).toFixed(1)}<small>k rpm</small></div><div class="s">${(an.bandHi - an.bandLo).toLocaleString()} rpm wide</div></div>`);
    { const h1 = cruiseLper100(100), h2 = cruiseLper100(130);
      const mt = drv.kmh || metric();
      tiles.push(`<div class="tile"><div class="k">Highway economy</div><div class="v">${mt ? h1.l100.toFixed(1) : (235.215 / h1.l100).toFixed(1)}<small>${mt ? 'L/100km' : 'mpg'}</small></div><div class="s">@100 km/h (${Math.round(h1.rpm)} rpm) · 130: ${mt ? h2.l100.toFixed(1) : (235.215 / h2.l100).toFixed(1)}</div></div>`); }
    tiles.push(`<div class="tile"><div class="k">Engine weight</div><div class="v">${Math.round(an.mass)}<small>kg</small></div><div class="s">${(PU[pu](an.peakP) / an.mass).toFixed(2)} ${pu}/kg ${delta(an.mass, b && b.mass, d => Math.round(Math.abs(d)) + ' kg', true)}</div></div>`);
    tiles.push(`<div class="tile"><div class="k">Build cost</div><div class="v">$${an.cost.toLocaleString()}</div><div class="s">$${Math.round(an.cost / hpOf(an.peakP))}/hp ${delta(an.cost, b && b.cost, d => '$' + Math.round(Math.abs(d)).toLocaleString(), true)}</div></div>`);
    $('#tiles').innerHTML = tiles.join('');
  }

  const COL = { cur: '#3987e5', base: '#d95926', hy: '#199e70' };
  let chP, chT, chA;
  let liveRpm = null;
  function auxSeries(an) {
    switch (state.aux) {
      case 'boost': return { y: an.boost.map(v => metric() ? v * 0.0689476 : v), unit: metric() ? 'bar' : 'psi', yMin: 0, fmt: v => v.toFixed(metric() ? 2 : 1) + (metric() ? ' bar' : ' psi') };
      case 've': return { y: an.ve.map(v => v * 100), unit: '% VE', yMin: 0, fmt: v => v.toFixed(0) + '%' };
      case 'lambda': return { y: an.lam, unit: 'λ', yMin: 0.6, fmt: v => 'λ ' + v.toFixed(2) };
      case 'egt': return { y: an.egt, unit: '°C', yMin: 400, fmt: v => Math.round(v) + ' °C' };
      case 'retard': return { y: an.ret, unit: '° retard', yMin: 0, fmt: v => v.toFixed(1) + '°' };
      case 'bte': return { y: an.bte.map(v => v * 100), unit: '% BTE', yMin: 0, fmt: v => v.toFixed(1) + '%' };
      case 'elec': return { y: an.eKw, unit: 'kW (− = harvest)', yMin: Math.min(0, Math.min.apply(null, an.eKw)), fmt: v => (v < 0 ? 'harvest ' + (-v).toFixed(1) : v.toFixed(1)) + ' kW' };
    }
  }
  function renderCharts() {
    const an = state.an, b = state.base && state.base.an;
    const xMax = Math.max(an.rpms[an.rpms.length - 1], b ? b.rpms[b.rpms.length - 1] : 0);
    const clip = liveRpm;
    const pw = an.pw.map(PU[state.unitP]), tq = an.tq.map(TU[state.unitT]);
    const sP = [{ x: an.rpms, y: pw, color: COL.cur, width: 2.5, clip, fill: 'rgba(57,135,229,0.08)' }];
    const sT = [{ x: an.rpms, y: tq, color: COL.cur, width: 2.5, clip, fill: 'rgba(57,135,229,0.08)' }];
    if (state.cfg.mguk) {
      sP.push({ x: an.rpms, y: an.rpms.map((r, i) => PU[state.unitP]((an.tq[i] + an.hy[i]) * r / 60 * 2 * Math.PI)), color: COL.hy, dash: [2, 4], width: 2 });
      sT.push({ x: an.rpms, y: an.rpms.map((r, i) => TU[state.unitT](an.tq[i] + an.hy[i])), color: COL.hy, dash: [2, 4], width: 2 });
    }
    if (b) {
      sP.push({ x: b.rpms, y: b.pw.map(PU[state.unitP]), color: COL.base, dash: [6, 4], width: 2 });
      sT.push({ x: b.rpms, y: b.tq.map(TU[state.unitT]), color: COL.base, dash: [6, 4], width: 2 });
    }
    const ip = an.pw.indexOf(an.peakP), it = an.tq.indexOf(an.peakT);
    Charts.setData(chP, { series: sP, xMin: 1000, xMax, unit: state.unitP, redline: state.cfg.redline, liveRpm: clip,
      peak: { x: an.rpms[ip], y: pw[ip], label: `${Math.round(pw[ip])} ${state.unitP}` } });
    Charts.setData(chT, { series: sT, xMin: 1000, xMax, unit: TL[state.unitT], redline: state.cfg.redline, liveRpm: clip,
      peak: { x: an.rpms[it], y: tq[it], label: `${Math.round(tq[it])} ${TL[state.unitT]}` } });
    const ax = auxSeries(an);
    const sA = [{ x: an.rpms, y: ax.y, color: COL.cur, width: 2, clip }];
    if (b) { const bx = auxSeries(b); sA.push({ x: b.rpms, y: bx.y, color: COL.base, dash: [6, 4], width: 2 }); }
    Charts.setData(chA, { series: sA, xMin: 1000, xMax, unit: ax.unit, yMin: ax.yMin, redline: state.cfg.redline, xAxis: true, liveRpm: clip });
    $('#pkPower').textContent = `${fmtP(an.peakP)} ${state.unitP} @ ${an.rpmP.toLocaleString()}`;
    $('#pkTorque').textContent = `${fmtT(an.peakT)} ${TL[state.unitT]} @ ${an.rpmT.toLocaleString()}`;
    const maxA = Math.max.apply(null, ax.y);
    $('#pkAux').textContent = 'max ' + ax.fmt(maxA);
    // legend
    const leg = [`<span><i style="border-color:${COL.cur}"></i>${esc(state.cfg.name)}</span>`];
    if (state.cfg.mguk) leg.push(`<span><i style="border-color:${COL.hy};border-top-style:dotted"></i>With hybrid assist</span>`);
    if (b) leg.push(`<span><i style="border-color:${COL.base};border-top-style:dashed"></i>Baseline: ${esc(state.base.cfg.name)}</span>`);
    $('#legend').innerHTML = leg.join('');
  }

  // tooltip
  Charts.onHover(r => {
    const tip = $('#tip');
    if (r == null || !state.an) { tip.hidden = true; return; }
    const an = state.an, b = state.base && state.base.an;
    const I = (xs, ys) => Charts.interp(xs, ys, r);
    const ax = auxSeries(an);
    const row = (col, k, v) => `<div class="r"><span><i style="background:${col}"></i>${k}</span><b>${v}</b></div>`;
    let h = `<div class="h">${Math.round(r).toLocaleString()} rpm</div>`;
    const p = I(an.rpms, an.pw), t = I(an.rpms, an.tq);
    if (isFinite(p)) {
      h += row(COL.cur, 'Power', `${fmtP(p)} ${state.unitP}`) + row(COL.cur, 'Torque', `${fmtT(t)} ${TL[state.unitT]}`) + row(COL.cur, ax.unit, ax.fmt(I(an.rpms, ax.y)));
    }
    if (state.cfg.mguk && isFinite(p)) { const hy = I(an.rpms, an.hy); h += row(COL.hy, 'Total power', `${fmtP((t + hy) * r / 60 * 2 * Math.PI)} ${state.unitP}`); }
    if (b) {
      const bp = I(b.rpms, b.pw), bt = I(b.rpms, b.tq);
      if (isFinite(bp)) h += row(COL.base, 'Base power', `${fmtP(bp)} ${state.unitP}`) + row(COL.base, 'Base torque', `${fmtT(bt)} ${TL[state.unitT]}`);
    }
    tip.innerHTML = h;
    tip.hidden = false;
    const cv = $('#chPower');
    const lay = chP.layout; if (!lay) return;
    const x = lay.pl + (r - lay.xMin) / (lay.xMax - lay.xMin) * lay.pw;
    const W = cv.clientWidth;
    tip.style.top = '40px';
    tip.style.left = (x + 20 + 190 > W ? x - 200 : x + 20) + 'px';
  });

  function renderWarns() {
    const an = state.an;
    const icon = { warning: '!', serious: '!!', critical: '✕' };
    const word = { warning: 'Watch', serious: 'Risk', critical: 'Danger' };
    if (!an.warns.length) { $('#warns').innerHTML = `<div class="ok-line">✓ No mechanical concerns — this build should live a long, happy life.</div>`; return; }
    $('#warns').innerHTML = an.warns.map(w => `<div class="warn"><span class="ico" style="background:var(--${w.sev})">${icon[w.sev]}</span><div><b>${word[w.sev]}:</b>${esc(w.msg)}</div></div>`).join('');
  }
  function renderTable() {
    const an = state.an;
    const rows = [];
    for (let i = 0; i < an.rpms.length; i++) {
      const r = an.rpms[i];
      if (r % 500 !== 0 && i !== an.rpms.length - 1) continue;
      rows.push(`<tr><td>${r.toLocaleString()}</td><td>${fmtP(an.pw[i])}</td><td>${fmtT(an.tq[i])}</td><td>${an.boost[i].toFixed(1)}</td><td>${(an.ve[i] * 100).toFixed(0)}%</td><td>${an.lam[i].toFixed(2)}</td><td>${Math.round(an.egt[i])}</td></tr>`);
    }
    $('#dataTable').innerHTML = `<table class="dt"><thead><tr><th>rpm</th><th>Power (${state.unitP})</th><th>Torque (${TL[state.unitT]})</th><th>Boost (psi)</th><th>VE</th><th>λ</th><th>EGT °C</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }

  $('#auxSel').addEventListener('change', e => { state.aux = e.target.value; renderCharts(); });
  $('#unitP').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.unitP = b.dataset.u; LS.set('ts.unitP', state.unitP); syncUnitBtns(); renderParts(); update(); });
  $('#unitT').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.unitT = b.dataset.u; LS.set('ts.unitT', state.unitT); syncUnitBtns(); update(); });
  function syncUnitBtns() {
    $$('#unitP button').forEach(b => b.classList.toggle('on', b.dataset.u === state.unitP));
    $$('#unitT button').forEach(b => b.classList.toggle('on', b.dataset.u === state.unitT));
  }
  $('#btnPin').addEventListener('click', () => {
    state.base = { cfg: JSON.parse(JSON.stringify(state.cfg)), an: E.analyze(JSON.parse(JSON.stringify(state.cfg))) };
    $('#btnUnpin').hidden = false; toast('Baseline pinned — now change parts and compare'); update(); renderRivals();
  });
  $('#btnUnpin').addEventListener('click', () => { state.base = null; $('#btnUnpin').hidden = true; update(); renderRivals(); });

  /* ---------------- header ---------------- */
  $('#buildName').addEventListener('input', e => { state.cfg.name = e.target.value || 'Unnamed'; renderCharts(); });
  function renderPresetSel() {
    $('#presetSel').innerHTML = `<option value="">Load preset…</option>` + PRE.PRESETS.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('');
  }
  $('#presetSel').addEventListener('change', e => {
    if (e.target.value === '') return;
    loadPreset(PRE.PRESETS[+e.target.value]);
    e.target.value = '';
  });
  function loadPreset(p) {
    loadCfg(p.cfg); state.fromPreset = p.name; toast(`Loaded ${p.name}`);
  }
  function loadCfg(cfg) {
    state.cfg = Object.assign({}, PRE.BASE, JSON.parse(JSON.stringify(cfg)));
    state.fromPreset = null;
    clampRevs(false);
    renderParts(); update();
    if (sim.mode === 'run' || sim.mode === 'off') sim.rpm = Math.min(sim.rpm, state.cfg.redline);
  }
  $('#btnSave').addEventListener('click', () => {
    const list = LS.get('ts.builds', []);
    const an = state.an;
    const entry = { name: state.cfg.name, cfg: JSON.parse(JSON.stringify(state.cfg)), hp: hpOf(an.peakP), nm: an.peakT, rel: an.reliability, label: engineLabel(state.cfg, an), date: Date.now() };
    const i = list.findIndex(b => b.name === entry.name);
    if (i >= 0) list[i] = entry; else list.unshift(entry);
    LS.set('ts.builds', list);
    toast(i >= 0 ? `Updated “${entry.name}” in your garage` : `Saved “${entry.name}” to your garage`);
    renderGarage();
  });

  /* ---------------- views ---------------- */
  $('#viewTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setView(b.dataset.view); });
  function setView(v) {
    const wasDrive = state.view === 'drive';
    state.view = v;
    $$('#viewTabs button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    ['dyno', 'drag', 'garage', 'challenges', 'career', 'drive'].forEach(id => { $('#view-' + id).hidden = id !== v; });
    if (v === 'drive') requestAnimationFrame(enterDrive); else if (wasDrive || drv.v > 0) leaveDrive();
    if (v === 'career') renderCareer();
    if (v === 'dyno') requestAnimationFrame(() => Charts.redrawAll());
    if (v === 'garage') renderGarage();
    if (v === 'challenges') renderChallenges();
    if (v === 'drag') renderGearInfo();
  }

  /* ---------------- garage ---------------- */
  function encodeCfg(c) {
    const d = {};
    Object.keys(PRE.BASE).forEach(k => { if (c[k] !== PRE.BASE[k]) d[k] = c[k]; });
    return 'TS1:' + btoa(unescape(encodeURIComponent(JSON.stringify(d))));
  }
  function decodeCfg(s) {
    s = s.trim();
    if (!s.startsWith('TS1:')) throw new Error('bad');
    const d = JSON.parse(decodeURIComponent(escape(atob(s.slice(4)))));
    const out = Object.assign({}, PRE.BASE);
    Object.keys(d).forEach(k => { if (k in PRE.BASE && typeof d[k] === typeof PRE.BASE[k]) out[k] = d[k]; });
    out.name = String(out.name).slice(0, 40);
    return out;
  }
  function renderGarage() {
    const list = LS.get('ts.builds', []);
    $('#savedList').innerHTML = list.length ? list.map((b, i) => `
      <div class="gcard"><h4>${esc(b.name)}</h4><p>${esc(b.label || '')}</p>
      <div class="specs">${Math.round(b.hp)} hp · ${Math.round(b.nm)} Nm · ${Math.round(b.rel)}% rel.</div>
      <div class="acts"><button class="btn small" data-load="${i}">Load</button><button class="btn small ghost" data-del="${i}">Delete</button></div></div>`).join('')
      : `<div class="ok-line">Nothing saved yet. Hit <b>Save</b> in the top bar to stash the current build here.</div>`;
    $('#presetList').innerHTML = PRE.PRESETS.map((p, i) => {
      const an = E.analyze(p.cfg);
      return `<div class="gcard"><h4>${esc(p.name)}</h4><p>${esc(p.desc)}</p><div class="specs">${Math.round(hpOf(an.peakP))} hp · ${Math.round(an.peakT)} Nm · ${an.g.dispL.toFixed(1)} L</div>
        <div class="acts"><button class="btn small" data-preset="${i}">Load</button></div></div>`;
    }).join('');
  }
  $('#view-garage').addEventListener('click', e => {
    const t = e.target;
    const list = LS.get('ts.builds', []);
    if (t.dataset.load != null) { loadCfg(list[+t.dataset.load].cfg); toast(`Loaded ${list[+t.dataset.load].name}`); setView('dyno'); }
    else if (t.dataset.del != null) { list.splice(+t.dataset.del, 1); LS.set('ts.builds', list); renderGarage(); }
    else if (t.dataset.preset != null) { loadPreset(PRE.PRESETS[+t.dataset.preset]); setView('dyno'); }
  });
  $('#btnCopyCode').addEventListener('click', () => {
    const code = encodeCfg(state.cfg);
    const inp = $('#shareCode'); inp.value = code;
    const done = () => toast('Build code copied');
    try {
      navigator.clipboard.writeText(code).then(done, () => { inp.select(); toast('Code selected — press Ctrl/Cmd+C to copy'); });
    } catch (e) { inp.select(); toast('Code selected — press Ctrl/Cmd+C to copy'); }
  });
  $('#btnLoadCode').addEventListener('click', () => {
    try { const c = decodeCfg($('#shareCode').value); loadCfg(c); toast(`Loaded ${c.name}`); setView('dyno'); }
    catch (e) { toast('That code doesn’t look right'); }
  });

  /* ---------------- challenges ---------------- */
  const hp = an => hpOf(an.peakP);
  const CHALLENGES = [
    { id: 'century', icon: '💯', title: 'Century Club', desc: '100+ hp per liter, naturally aspirated, no nitrous.', check: (a, c) => c.aspiration === 'na' && !c.nitrous && a.specific >= 100, prog: a => `${a.specific.toFixed(0)} hp/L` },
    { id: 'daily', icon: '🛒', title: 'Daily Driver', desc: '250+ hp on 87 or 91 pump gas with 90%+ reliability, under $15,000.', check: (a, c) => hp(a) >= 250 && (c.fuel === 'p87' || c.fuel === 'p91') && a.reliability >= 90 && a.cost <= 15000, prog: a => `${Math.round(hp(a))} hp · ${Math.round(a.reliability)}% · $${a.cost.toLocaleString()}` },
    { id: 'budget', icon: '💸', title: 'Budget Beast', desc: '400+ hp for under $14,000 with 70%+ reliability.', check: a => hp(a) >= 400 && a.cost <= 14000 && a.reliability >= 70, prog: a => `${Math.round(hp(a))} hp · $${a.cost.toLocaleString()} · ${Math.round(a.reliability)}%` },
    { id: 'tiny', icon: '🐜', title: 'Tiny Terror', desc: '300+ hp from 1.0 liter or less.', check: a => hp(a) >= 300 && a.g.dispL <= 1.0005, prog: a => `${Math.round(hp(a))} hp from ${a.g.dispL.toFixed(2)} L` },
    { id: 'flat', icon: '📏', title: 'Table-Flat', desc: 'Hold at least 90% of peak torque all the way from 2,500 to 6,000 rpm.', check: a => a.rpms.every((r, i) => r < 2500 || r > 6000 || a.tq[i] >= 0.9 * a.peakT) && a.cfg.redline >= 6000, prog: a => `≥90% from ${a.bandLo} to ${a.bandHi}` },
    { id: 'torque', icon: '🔩', title: 'Stump Puller', desc: '1,000 lb-ft (1,356 Nm) of crank torque.', check: a => a.peakT >= 1356, prog: a => `${Math.round(a.peakT / 1.35582)} lb-ft` },
    { id: 'screamer', icon: '📯', title: 'Screamer', desc: 'A 12,000+ rpm limiter with 70%+ reliability.', check: (a, c) => c.redline >= 12000 && a.reliability >= 70, prog: (a, c) => `${c.redline.toLocaleString()} rpm · ${Math.round(a.reliability)}%` },
    { id: 'eco', icon: '🍃', title: 'Hypermiler', desc: 'Reach 40%+ peak brake thermal efficiency at full load.', check: a => a.bteMax >= 0.40, prog: a => `${(a.bteMax * 100).toFixed(1)}% BTE` },
    { id: 'k', icon: '🚀', title: 'Four Digits', desc: '1,000+ hp from the engine alone, with 50%+ reliability.', check: a => hp(a) >= 1000 && a.reliability >= 50, prog: a => `${Math.round(hp(a))} hp · ${Math.round(a.reliability)}%` },
    { id: 'rotary', icon: '🔺', title: 'Brap Lord', desc: '500+ hp from a rotary with 60%+ reliability.', check: (a, c) => c.layout === 'R' && hp(a) >= 500 && a.reliability >= 60, prog: (a, c) => c.layout === 'R' ? `${Math.round(hp(a))} hp · ${Math.round(a.reliability)}%` : 'Needs a rotary' },
    { id: 'hybrid', icon: '⚡', title: 'Electric Shock', desc: '800+ hp combined, with an MGU-K of 150 kW or more.', check: (a, c) => c.mguk >= 150 && a.peakHy / 745.7 >= 800, prog: (a, c) => `${Math.round(a.peakHy / 745.7)} hp · ${c.mguk} kW` },
    { id: 'ten', icon: '🏁', title: 'Ten-Second Car', desc: 'Run the quarter mile in under 10.000 seconds.', drag: true, check: (a, c, d) => d && d.q && d.q < 10, prog: (a, c, d) => d && d.q ? `last run ${d.q.toFixed(3)} s` : 'Do a drag run' },
    { id: 'sixty', icon: '⏱️', title: 'Sub-Three', desc: '0–60 mph in under 3.0 seconds on the drag strip.', drag: true, check: (a, c, d) => d && d.t60 && d.t60 < 3, prog: (a, c, d) => d && d.t60 ? `${d.t60.toFixed(2)} s` : 'Do a drag run' },
    { id: 'kaboom', icon: '💥', title: 'Kaboom', desc: 'Blow up an engine. It happens to the best of us.', special: true, check: () => state.blownCount > 0, prog: () => `${state.blownCount} engines destroyed` },
  ];
  function checkChallenges() {
    if (state.mode === 'career') return;
    const a = state.an, c = state.cfg;
    let changed = false;
    CHALLENGES.forEach(ch => {
      if (state.done[ch.id]) return;
      if (state.fromPreset && !ch.special) return;
      if (ch.drag && (!state.lastDrag || state.lastDrag.cfgKey !== JSON.stringify(c))) return;
      if (ch.check(a, c, state.lastDrag)) { state.done[ch.id] = Date.now(); changed = true; toast(`🏆 Challenge complete: ${ch.title}`); }
    });
    if (changed) LS.set('ts.done', state.done);
    $('#chalBadge').textContent = `${Object.keys(state.done).length}/${CHALLENGES.length}`;
    if (state.view === 'challenges') renderChallenges();
  }
  function renderChallenges() {
    const a = state.an, c = state.cfg;
    $('#chalList').innerHTML = (state.fromPreset ? `<div class="ok-line" style="grid-column:1/-1">You're on an unmodified preset (${esc(state.fromPreset)}) — change any part to make it yours and start earning.</div>` : '') +
      CHALLENGES.map(ch => `<div class="gcard chal ${state.done[ch.id] ? 'done' : ''}"><div class="medal">${ch.icon}</div><div><h4>${ch.title}</h4><p>${ch.desc}</p><div class="prog">Now: ${ch.prog(a, c, state.lastDrag)}</div></div></div>`).join('');
  }

  /* =================================================================
     ENGINE SIMULATION
     ================================================================= */
  const sim = {
    mode: 'off', rpm: 0, thr: 0, pedal: false, fixThr: 0, boostF: 0, cut: false, t: 0, theta: 0,
    dyno: null, drag: null, load: 0, boostE: 0, torque: 0, kers: 0, flare: 0, lastThrCmd: 0, gearF: 0, gearA: 0, popFlash: 0,
  };
  const hasTurbo = () => turbo(state.cfg);
  function curveAt(arr, rpm) {
    const an = state.an;
    if (rpm <= an.rpms[0]) return arr[0] * (0.55 + 0.45 * Math.max(0, rpm) / an.rpms[0]);
    const v = Charts.interp(an.rpms, arr, Math.min(rpm, an.rpms[an.rpms.length - 1]));
    return v;
  }
  function frictionT(rpm) {
    const an = state.an;
    const f = rpm <= an.rpms[0] ? an.pts[0].fmep : Charts.interp(an.rpms, an.pts.map(p => p.fmep), Math.min(rpm, an.rpms[an.rpms.length - 1]));
    const k = isR(state.cfg) ? 2 * Math.PI : 4 * Math.PI;
    return f * 1e5 * an.g.D / k * (rpm > 50 ? 1 : rpm / 50);
  }
  function pumpT(thr) { const k = isR(state.cfg) ? 2 * Math.PI : 4 * Math.PI; return (1 - thr) * 0.55e5 * state.an.g.D / k; }
  function inertia() {
    const c = state.cfg;
    return 0.05 + 0.045 * state.an.g.dispL + { stock: 0.13, light: 0.075, ultra: 0.035 }[c.flywheel] + (c.mguk ? 0.02 : 0);
  }
  const eTurboOn = () => { const c = state.cfg; return !!(c.eturbo && (c.aspiration === 'turbo' || c.aspiration === 'esc_turbo')); };
  function tauBoost() {
    const c = state.cfg;
    if (!hasTurbo()) return 0.05;
    if (eTurboOn()) return 0.07;   // motor spins the turbo up almost instantly
    return (0.12 + 0.55 * Math.pow(c.turboSize / 60, 2) * Math.sqrt(2.5 / state.an.g.dispL) / Math.sqrt(c.aspiration === 'twin' ? 1 : c.turboCount)) * (c.antilag ? 0.35 : 1);
  }
  function engineTorque(rpm, boostF, boostE) {
    const an = state.an;
    const full = curveAt(an.tq, rpm);
    if (an.elec) {
      // exhaust-driven boost lags; electrically driven boost arrives almost at once
      const na = curveAt(an.tqNA, rpm), noE = curveAt(an.tqNoE, rpm);
      return na + (noE - na) * clamp(boostF, 0, 1) + (full - noE) * clamp(boostE == null ? sim.boostE : boostE, 0, 1);
    }
    if (!hasTurbo()) return full;
    const na = curveAt(an.tqNA, rpm);
    return na + (full - na) * clamp(boostF, 0, 1);
  }

  // free-running physics step (engine not externally loaded)
  function freeStep(dt, thrCmd, limit) {
    const c = state.cfg, an = state.an;
    const idle = an.idle;
    let idleThr = 0;
    if (sim.mode !== 'off') idleThr = clamp((idle - sim.rpm) / idle * 2.5 + 0.035, 0, 0.4);
    if (sim.flare > 0) { sim.flare -= dt; idleThr = Math.max(idleThr, 0.12); }
    const tgt = Math.max(thrCmd, idleThr);
    sim.thr += (tgt - sim.thr) * Math.min(1, dt / 0.045);
    // limiter
    if (sim.rpm >= limit) sim.cut = true;
    else if (sim.rpm < limit - Math.max(120, limit * 0.015)) sim.cut = false;
    const thrMap = Math.pow(sim.thr, 0.6);
    const Tf = frictionT(sim.rpm);
    let T;
    if (sim.cut) T = -Tf - pumpT(sim.thr);
    else {
      const Tb = engineTorque(sim.rpm, sim.boostF);
      T = thrMap * (Tb + Tf) - Tf - pumpT(sim.thr);
      if (c.mguk && thrCmd > 0.2) { const k = E.hybridTorque(c, sim.rpm) * thrCmd; T += k; sim.kers = thrCmd; } else sim.kers = 0;
    }
    sim.rpm += T / inertia() * dt * 60 / (2 * Math.PI);
    sim.rpm = Math.max(0, sim.rpm);
    sim.torque = sim.cut ? 0 : Math.max(0, thrMap * (engineTorque(sim.rpm, sim.boostF) + Tf) - Tf);
    sim.load = sim.cut ? 0 : clamp(thrMap * (0.85 + 0.3 * sim.boostF * (hasTurbo() ? 1 : 0)), 0, 1.2);
    // boost dynamics (unloaded engines don't build full boost)
    const bt = hasTurbo() ? (sim.cut ? (c.antilag ? 0.8 : sim.boostF) : thrMap * (0.55 + 0.45 * thrMap)) : thrMap;
    const tau = bt > sim.boostF ? tauBoost() : (c.antilag ? 0.8 : 0.18);
    sim.boostF += (bt - sim.boostF) * Math.min(1, dt / tau);
    sim.boostE += ((sim.cut ? 0 : thrMap) - sim.boostE) * Math.min(1, dt / 0.15);
  }

  function boostPsiNow() {
    const an = state.an;
    if (an.maxBoost < 0.3) return -12 * (1 - Math.pow(sim.thr, 0.5)) * (sim.rpm > 100 ? 1 : 0);
    const r = Math.max(sim.rpm, 1000);
    const b = an.elec ? curveAt(an.boostNoE, r) * clamp(sim.boostF, 0, 1) + (curveAt(an.boost, r) - curveAt(an.boostNoE, r)) * clamp(sim.boostE, 0, 1)
      : curveAt(an.boost, r) * clamp(sim.boostF, 0, 1);
    return sim.thr < 0.3 && b < 1 ? -12 * (1 - sim.thr / 0.3) * (sim.rpm > 100 ? 1 : 0) + b : b;
  }


  /* ---------------- fuel consumption ----------------
     Fuel energy = indicated power / indicated efficiency.
     Indicated power = brake + friction + pumping. The efficiency comes from the dyno model at
     each rpm (fuel actually burnt, so WOT enrichment isn't counted as useful). WOT runs rich
     (extra fuel for power), part throttle runs at stoich, and closed-throttle overrun is fuel-cut. */
  function etaInd(rpm) {
    const an = state.an, c = state.cfg, F = E.FUELS[c.fuel];
    const i = clamp(Math.round((Math.max(rpm, an.rpms[0]) - an.rpms[0]) / an.step), 0, an.pts.length - 1), p = an.pts[i];
    const w = p.rpm / 60 * 2 * Math.PI, k = isR(c) ? 2 * Math.PI : 4 * Math.PI;
    const Pind = (p.torque + p.fmep * 1e5 * an.g.D / k) * w;
    const burnt = p.mdot / (p.lambda * F.stoich) * F.lhv * Math.min(1, p.lambda);
    return clamp(Pind / Math.max(1, burnt), 0.12, 0.5);
  }
  // fuel flow in kg/s for a running engine at rpm, brake torque (Nm), throttle 0..1
  function fuelKgS(rpm, Tbrake, thr, cut) {
    const c = state.cfg, F = E.FUELS[c.fuel], an = state.an;
    if (rpm < 150) return 0;
    const w = rpm / 60 * 2 * Math.PI;
    const idleLike = (frictionT(rpm) + pumpT(0)) * w / etaInd(rpm);
    if (cut || (thr < 0.03 && rpm > an.idle * 1.35)) {
      // deceleration fuel cut — unless the tune deliberately dumps fuel to make pops / keep the turbo lit
      const dump = (c.antilag ? 1.6 : 0) + (c.pops === 'aggressive' ? 0.35 : c.pops === 'mild' ? 0.12 : 0);
      return idleLike * dump / F.lhv;
    }
    const Pind = Math.max(0, Tbrake + frictionT(rpm) + pumpT(thr)) * w;
    const lam = thr > 0.92 ? Math.min(1, c.lambda) : 1;
    return Pind / etaInd(rpm) / lam / F.lhv;
  }
  const kgsToLh = kgs => kgs / E.FUELS[state.cfg.fuel].dens * 3600;
  // steady cruise in top gear on a flat road
  function cruiseLper100(kmh) {
    const S = E.carSetup(state.cfg, state.an), v = kmh / 3.6, n = S.ratios.length;
    let g = n - 1, rpm = v / S.rw / (2 * Math.PI) * 60 * S.ratios[g];
    while (rpm < state.an.idle * 1.25 && g > 0) { g--; rpm = v / S.rw / (2 * Math.PI) * 60 * S.ratios[g]; }
    const F = 0.5 * 1.2 * S.CdA * v * v + 0.013 * S.mass * 9.81;
    const T = F * S.rw / (S.ratios[g] * S.dtEff);
    const Tw = curveAt(state.an.tq, Math.max(rpm, 1000)), Tf = frictionT(rpm);
    const thr = clamp((T + Tf) / (Tw + Tf), 0.02, 1);
    const lh = kgsToLh(fuelKgS(rpm, T, thr, false));
    return { l100: lh / kmh * 100, rpm, gear: g + 1 };
  }
  const fuelTxt = (l100) => drv.kmh || metric() ? `${l100.toFixed(1)} L/100km` : `${(235.215 / Math.max(0.1, l100)).toFixed(1)} mpg`;
  const fuelLive = { kgs: 0, lh: 0 };

  function tick(dt) {
    const c = state.cfg, an = state.an;
    if (!an) return;
    const thrCmd = sim.pedal ? 1 : sim.fixThr;
    sim.gearA = 0;
    switch (sim.mode) {
      case 'off':
        sim.thr = 0; sim.cut = false; sim.kers = 0;
        sim.rpm = Math.max(0, sim.rpm - (frictionT(sim.rpm) + pumpT(0)) / inertia() * dt * 60 / (2 * Math.PI) - 30 * dt);
        sim.torque = 0; sim.load = 0; sim.boostF *= Math.exp(-dt / 0.3);
        break;
      case 'crank':
        sim.t += dt;
        sim.rpm += (230 + 25 * Math.sin(sim.t * 30) - sim.rpm) * Math.min(1, dt * 6);
        sim.thr = 0; sim.load = 0;
        if (sim.t > 0.95) { sim.mode = 'run'; sim.rpm = Math.max(sim.rpm, 420); sim.flare = 0.55; updateStartBtn(); if (sim.after) { const f = sim.after; sim.after = null; setTimeout(f, 700); } }
        break;
      case 'run':
        if (state.view === 'drive' && drv.S) driveStep(dt);
        else freeStep(dt, thrCmd, c.redline);
        if (sim.rpm < 120 && sim.flare <= 0) { sim.mode = 'off'; updateStartBtn(); toast('Stalled!'); }
        break;
      case 'dyno': dynoStep(dt); break;
      case 'drag': dragStep(dt); break;
      case 'blown':
        sim.rpm = Math.max(0, sim.rpm - 5000 * dt); sim.thr = 0; sim.load = 0; sim.torque = 0; sim.kers = 0; sim.boostF *= 0.9;
        break;
    }
    if (state.view === 'drive' && drv.S && sim.mode !== 'run') driveCoast(dt);
    // BOV / flutter on sharp lift
    const thrNow = sim.thr;
    if (hasTurbo() && sim.lastThrCmd > 0.55 && thrNow < 0.3 && !c.antilag) {
      const psi = curveAt(an.boost, Math.max(sim.rpm, 1000)) * sim.boostF;
      if (psi > 3) {
        EngineAudio.event({ type: 'bov', amt: clamp(psi / 18, 0.25, 1), flutter: !c.bov });
        sim.boostF *= 0.35;
      }
    }
    sim.lastThrCmd = thrNow;
    // drag animation continues after the engine finishes its run
    if (sim.drag && sim.mode !== 'drag') dragAnim(dt);
    // visual crank
    const slow = Math.max(20, sim.rpm / 350);
    sim.slow = slow;
    sim.theta = (sim.theta + sim.rpm * 6 * dt / slow) % 2160;
    sim.audioDirty = true;
  }
  function sendAudio() {
    const c = state.cfg, an = state.an;
    if (EngineAudio.ready && an) {
      const running = sim.mode === 'run' || sim.mode === 'dyno' || sim.mode === 'drag';
      EngineAudio.state({
        rpm: sim.rpm, throttle: sim.thr, load: sim.load, boost: an.maxBoost > 0.5 ? clamp(boostPsiNow() / Math.max(8, an.maxBoost), 0, 1.2) : 0,
        skid: state.view === 'drive' ? clamp((drv.bres && (drv.bres.lockF || drv.bres.lockR) ? 0.8 : 0) + (drv.spin ? 0.35 + drv.slip * 0.6 : 0) + (drv.bres && drv.bres.abs ? 0.25 : 0), 0, 1) : 0,
        ek: an.elec && running && an.eDrawMax > 0 ? clamp(Math.max(0, curveAt(an.eKw, Math.max(1000, sim.rpm))) / an.eDrawMax, 0, 1) * clamp(sim.boostE, 0, 1) * (sim.cut ? 0 : 1) : 0,
        cut: sim.cut, running, crank: sim.mode === 'crank', kers: sim.kers, gearF: sim.gearF, gearA: sim.gearA,
        mic: state.mic || 'exhaust', room: sim.mode === 'dyno' ? 0.22 : sim.drag ? 0.05 : 0.12, volume: state.volume,
      });
    }
  }

  /* ---------------- start / stop ---------------- */
  let audioBoot = null;
  // Initialise audio exactly once. (Calling this on every key-repeat used to re-send the
  // synth config ~30x/s, resetting the exhaust model mid-sound -> crackle.)
  function ensureAudio() {
    if (!audioBoot) audioBoot = bootAudio();
    else if (EngineAudio.ready) EngineAudio.resume();   // harmless if already running
    return audioBoot;
  }
  async function bootAudio() {
    try {
      await EngineAudio.init();
      pushSoundConfig();
      $('#audioStatus').textContent = `Audio: ${EngineAudio.mode === 'worklet' ? 'AudioWorklet' : 'ScriptProcessor'} synth running`;
    } catch (e) { $('#audioStatus').textContent = 'Audio unavailable in this browser'; }
  }
  function pushSoundConfig() {
    if (!EngineAudio.ready || !state.an) return;
    EngineAudio.config(soundConfigFor(state.cfg, state.an));
  }
  function startEngine(after) {
    if (sim.mode === 'blown') return;
    ensureAudio();
    sim.mode = 'crank'; sim.t = 0; sim.after = after || null; updateStartBtn();
  }
  function stopEngine() { sim.mode = 'off'; sim.dyno = null; liveRpm = null; updateStartBtn(); renderCharts(); }
  function toggleEngine() {
    if (sim.mode === 'blown') { $('#blown').hidden = false; return; }
    if (sim.mode === 'off') startEngine();
    else if (sim.mode === 'run' || sim.mode === 'dyno' || sim.mode === 'crank') stopEngine();
  }
  function updateStartBtn() {
    const b = $('#btnStart');
    const on = sim.mode !== 'off' && sim.mode !== 'blown';
    b.classList.toggle('on', on);
    b.textContent = sim.mode === 'crank' ? 'CRANKING…' : on ? 'STOP ENGINE' : sim.mode === 'blown' ? 'ENGINE BLOWN' : 'START ENGINE';
    $('#btnDyno').disabled = sim.mode === 'blown' || sim.mode === 'drag';
  }
  $('#btnStart').addEventListener('click', toggleEngine);

  /* ---------------- dyno ---------------- */
  function startDyno(opts) {
    if (!opts || opts instanceof Event) opts = {};
    if (sim.mode === 'blown') { toast('Engine is blown — rebuild it first'); $('#blown').hidden = false; return false; }
    if (sim.mode === 'drag') { toast('Finish the drag run first'); return false; }
    if (sim.mode === 'dyno') return false;
    setView('dyno');
    if (sim.mode === 'off' || sim.mode === 'crank') { if (sim.mode === 'off') startEngine(() => startDyno(opts)); return true; }
    const c = state.cfg, an = state.an;
    const r0 = Math.max(an.idle * 1.5, Math.min(2000, c.redline * 0.25));
    sim.dyno = { opts, phase: 'prep', t: 0, r0, rate: c.redline * 0.085, failAt: Math.random() < an.failChance * failMult() ? r0 + (0.5 + 0.45 * Math.random()) * (c.redline - r0) : null };
    sim.mode = 'dyno';
    $('#btnDyno').textContent = 'Pulling…';
    return true;
  }
  function dynoStep(dt) {
    const d = sim.dyno, c = state.cfg;
    d.t += dt;
    if (d.phase === 'prep') {
      sim.thr += (0.2 - sim.thr) * Math.min(1, dt / 0.1);
      sim.rpm += (d.r0 - sim.rpm) * Math.min(1, dt * 2.5);
      sim.boostF += (0.2 - sim.boostF) * dt;
      sim.cut = false; sim.load = 0.25; sim.kers = 0;
      liveRpm = null;
      if (d.t > 1.4) { d.phase = 'pull'; d.t = 0; }
    } else if (d.phase === 'pull') {
      sim.thr += (1 - sim.thr) * Math.min(1, dt / 0.05);
      sim.rpm += d.rate * dt;
      sim.boostF += (1 - sim.boostF) * Math.min(1, dt / tauBoost());
      sim.boostE += (1 - sim.boostE) * Math.min(1, dt / 0.15);
      sim.cut = false; sim.load = 1; sim.kers = c.mguk ? 1 : 0;
      sim.torque = engineTorque(sim.rpm, 1);
      liveRpm = Math.min(sim.rpm, c.redline);
      if (d.failAt && sim.rpm >= d.failAt) { blow(); return; }
      if (sim.rpm >= c.redline) {
        const done = d.opts && d.opts.onDone;
        sim.mode = 'run'; sim.dyno = null; liveRpm = null; sim.pedal = false;
        if (done) setTimeout(() => done({ hp: state.an.peakP / 745.7 }), 600);
        $('#btnDyno').textContent = 'Dyno pull';
        const an = state.an;
        toast(`Pull complete: ${fmtP(an.peakP)} ${state.unitP} @ ${an.rpmP.toLocaleString()} · ${fmtT(an.peakT)} ${TL[state.unitT]}`);
      }
    }
  }
  $('#btnDyno').addEventListener('click', () => startDyno({}));

  function blow() {
    const an = state.an;
    const cb = (sim.dyno && sim.dyno.opts && sim.dyno.opts.onDone) || (sim.mode === 'drag' && sim.drag && sim.drag.opts && sim.drag.opts.onDone);
    sim.mode = 'blown'; sim.dyno = null; liveRpm = null;
    if (sim.drag) { sim.drag.dead = true; sim.drag.done = true; $('#btnRun').disabled = false; }
    const careerNote = careerBlown();
    EngineAudio.event({ type: 'explode' });
    state.blownCount++; LS.set('ts.blown', state.blownCount);
    $('#blownTitle').textContent = an.failMode;
    $('#blownMsg').innerHTML = `Reliability was <b>${Math.round(an.reliability)}%</b>. ${an.warns[0] ? 'The biggest problem: ' + esc(an.warns[0].msg) + '.' : ''} Back off the tune or beef up the parts.${careerNote}`;
    document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 600);
    setTimeout(() => { $('#blown').hidden = false; }, 700);
    $('#btnDyno').textContent = 'Dyno pull';
    updateStartBtn(); renderCharts(); checkChallenges();
    if (cb) setTimeout(() => cb({ blown: true }), 50);
  }
  $('#btnRebuild').addEventListener('click', () => { $('#blown').hidden = true; sim.mode = 'off'; sim.rpm = 0; updateStartBtn(); toast('Fresh short block installed'); });

  /* ---------------- drag strip ---------------- */
  function renderRivals() {
    const sel = $('#rivalSel'), cur = sel.value;
    sel.innerHTML = (state.base ? `<option value="base">Your baseline: ${esc(state.base.cfg.name)}</option>` : '') +
      PRE.PRESETS.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('');
    if (cur && Array.from(sel.options).some(o => o.value === cur)) sel.value = cur;
    else sel.value = String(PRE.PRESETS.findIndex(p => p.name === 'Hot Hatch 2.0T'));
  }
  function renderGearInfo() {
    if (!state.an || state.view !== 'drag') return;
    const d = E.dragSim(state.cfg, state.an, {});
    const mass = Math.round(d.mass);
    $('#gearInfo').textContent = `${mass} kg · ${(hpOf(state.an.peakP) / (mass / 1000)).toFixed(0)} hp/t · gears ${d.ratios.map(r => (r / d.ratios[d.ratios.length - 1] * 3).toFixed(2)).join(' / ')}`;
  }
  // opts: { dist, rival: { name, res }, onDone(result) }
  function runDrag(opts) {
    if (!opts || opts instanceof Event) opts = {};
    if (sim.mode === 'blown') { toast('Engine is blown — rebuild it first'); $('#blown').hidden = false; return false; }
    if (sim.mode === 'dyno') { toast('Finish the dyno pull first'); return false; }
    if (sim.drag && !sim.drag.done) { toast('A run is already in progress'); return false; }
    setView('drag');
    if (sim.mode === 'off' || sim.mode === 'crank') { if (sim.mode === 'off') startEngine(() => runDrag(opts)); return true; }
    const c = state.cfg, an = state.an;
    const dist = opts.dist || 402.336;
    const mult = failMult();
    const res = E.dragSim(c, an, { dist, failRoll: mult > 0 ? Math.random() / mult : 2 });
    let rname, rres;
    if (opts.rival) { rname = opts.rival.name; rres = opts.rival.res; }
    else {
      const rv = $('#rivalSel').value;
      let rcfg;
      if (rv === 'base' && state.base) { rcfg = state.base.cfg; rname = state.base.cfg.name; } else { const p = PRE.PRESETS[+rv] || PRE.PRESETS[2]; rcfg = p.cfg; rname = p.name; }
      rres = E.dragSim(rcfg, E.analyze(rcfg), { dist });
    }
    sim.drag = { phase: 'stage', t: 0, res, rres, rname, dist, opts, gear: 1, me: { x: 0, v: 0 }, rv: { x: 0, v: 0 }, tree: { stage: 0 }, done: false, cfgKey: JSON.stringify(c) };
    sim.mode = 'drag';
    $('#slip').innerHTML = '';
    $('#btnRun').disabled = true;
    updateStartBtn();
    return true;
  }
  // look up the sim state at playback time t (by each frame's own timestamp, interpolated)
  function frameAt(frames, t) {
    if (!frames.length) return null;
    if (t <= frames[0].t) return frames[0];
    const n = frames.length;
    if (t >= frames[n - 1].t) return frames[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (frames[m].t <= t) lo = m; else hi = m; }
    const a = frames[lo], b = frames[hi], k = (t - a.t) / ((b.t - a.t) || 1);
    return Object.assign({}, a, { t, x: a.x + (b.x - a.x) * k, v: a.v + (b.v - a.v) * k, rpm: a.gear === b.gear ? a.rpm + (b.rpm - a.rpm) * k : a.rpm, boost: a.boost + (b.boost - a.boost) * k, batt: a.batt + (b.batt - a.batt) * k });
  }
  function dragStep(dt) {
    const d = sim.drag, c = state.cfg;
    d.t += dt;
    if (d.phase === 'stage') {
      // two-step launch control holding launch rpm
      freeStep(dt, d.t > 0.4 ? 1 : 0.3, c.launchRpm);
      sim.boostF = Math.min(sim.boostF, hasTurbo() ? 0.3 : 1);
      d.tree.stage = d.t < 0.9 ? 0 : d.t < 1.3 ? 1 : d.t < 1.7 ? 2 : d.t < 2.1 ? 3 : 4;
      if (d.t >= 2.1) { d.phase = 'run'; d.rt = 0; }
      return;
    }
    if (d.phase === 'run') {
      d.rt += dt;
      const f = frameAt(d.res.frames, d.rt);
      if (f) {
        if (f.gear !== d.gear) {
          d.gear = f.gear;
          EngineAudio.event({ type: 'shift', amt: 0.6 });
        }
        sim.rpm = f.rpm; sim.thr = f.throttle; sim.boostF = f.boost; sim.boostE = f.eb || 0; sim.cut = false;
        sim.kers = f.kers ? 1 : 0;
        sim.load = f.throttle;
        sim.torque = engineTorque(f.rpm, f.boost, f.eb || 0) * f.throttle;
        d.me = { x: f.x, v: f.v, spin: f.spin, gear: f.gear, flame: f.shifting && (c.pops !== 'off' || c.antilag) };
        if (c.straightCut) { sim.gearF = f.rpm / 60 * 23; sim.gearA = 0.4 + 0.6 * f.throttle; }
      }
      dragAnimRival(d);
      const last = d.res.frames[d.res.frames.length - 1];
      if (!last || d.rt >= last.t) {
        if (d.res.failed) { blow(); return; }
        d.phase = 'coast'; sim.mode = 'run'; sim.pedal = false; sim.fixThr = 0; syncThrUI(); updateStartBtn();
        sim.thr = 0;
        d.meDone = true;
        state.lastDrag = Object.assign({}, d.res.marks, { cfgKey: d.cfgKey });
        checkChallenges();
        if (!d.done) showSlip(d, true);
      }
    }
  }
  function dragAnimRival(d) {
    const rf = frameAt(d.rres.frames, d.rt);
    if (rf) d.rv = { x: rf.x, v: rf.v, spin: rf.spin };
  }
  function dragAnim(dt) {
    const d = sim.drag;
    if (!d || d.phase !== 'coast') return;
    d.rt += dt;
    d.me.v *= Math.exp(-dt * 0.5); d.me.x += d.me.v * dt; d.me.spin = false; d.me.flame = sim.thr < 0.05 && Math.random() < 0.05 && state.cfg.pops !== 'off';
    const rl = d.rres.frames[d.rres.frames.length - 1];
    if (d.rt < rl.t) dragAnimRival(d);
    else { d.rv.v *= Math.exp(-dt * 0.5); d.rv.x += d.rv.v * dt; d.rv.spin = false; }
    if (!d.done && d.rt >= rl.t) { d.done = true; showSlip(d); $('#btnRun').disabled = false; }
    if (d.rt > Math.max(rl.t, d.res.frames[d.res.frames.length - 1].t) + 4) { /* keep last positions */ }
  }
  function showSlip(d, partial) {
    const me = d.res.marks, rv = d.rres.marks;
    const mph = metric() ? (v => (v * 1.609344).toFixed(1) + ' km/h') : (v => v.toFixed(1) + ' mph');
    const t = v => v ? v.toFixed(3) : '—';
    const eighth = d.dist < 300;
    const myF = me.fin || 99, rvF = rv.fin || 99;
    const card = (name, m, win, top) => `<div class="slip-card"><h4><span>${esc(name)}</span>${win ? '<span class="win">WIN</span>' : ''}</h4>
      <div class="row"><span>60 ft</span><span>${t(m.ft60)}</span></div>
      <div class="row"><span>330 ft</span><span>${t(m.ft330)}</span></div>
      <div class="row ${eighth ? 'big' : ''}"><span>1/8 mi ET</span><span>${t(m.e8)}</span></div>
      <div class="row ${eighth ? 'big' : ''}"><span>1/8 mi speed</span><span>${m.trap8 ? mph(m.trap8) : '—'}</span></div>
      ${eighth ? '' : `<div class="row big"><span>1/4 mi ET</span><span>${t(m.q)}</span></div>
      <div class="row big"><span>1/4 mi speed</span><span>${m.trap ? mph(m.trap) : '—'}</span></div>`}
      <div class="row"><span>0–60 mph</span><span>${m.t60 ? m.t60.toFixed(2) : '—'}</span></div>
      <div class="row"><span>0–100 km/h</span><span>${m.t100k ? m.t100k.toFixed(2) : '—'}</span></div>
      ${eighth ? '' : `<div class="row"><span>0–100 mph</span><span>${m.t100 ? m.t100.toFixed(2) : '—'}</span></div>`}
      <div class="row"><span>Est. top speed</span><span>${mph(top * 2.23694)}</span></div></div>`;
    if (partial) {
      $('#slip').innerHTML = card(state.cfg.name + ' (you)', me, false, d.res.topSpeed) + `<div class="slip-card" style="display:grid;place-items:center;opacity:.7"><h4>${esc(d.rname)}</h4>still on track…</div>`;
      toast(`FINISH! ${t(me.fin)} s @ ${mph(me.trapFin)}`);
      return;
    }
    $('#slip').innerHTML = card(state.cfg.name + ' (you)', me, myF <= rvF, d.res.topSpeed) + card(d.rname, rv, rvF < myF, d.rres.topSpeed);
    if (!d.opts.onDone) toast(myF <= rvF ? `You win! ${t(me.fin)} s @ ${mph(me.trapFin)}` : `Beaten by ${(myF - rvF).toFixed(3)} s — back to the shop`);
    else d.opts.onDone({ win: myF <= rvF, me, rv, margin: rvF - myF });
  }
  $('#btnRun').addEventListener('click', () => runDrag({}));


  /* =================================================================
     CAREER MODE
     ================================================================= */
  const CR = Career;
  state.mode = 'sandbox';
  state.career = LS.get('ts.career', null);
  const inCareer = () => state.mode === 'career' && !!state.career;
  const tierName = t => CR.TIERS[Math.min(t, CR.TIERS.length - 1)].name;
  const diffOf = () => CR.DIFFICULTY[state.career.diff];
  const owned = () => Object.assign({}, PRE.BASE, state.career.cfg);
  const cfgKey = c => { const o = Object.assign({}, c); delete o.name; return JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]])); };
  const money = v => (v < 0 ? '−$' : '$') + Math.abs(Math.round(v)).toLocaleString();
  function pending() { return inCareer() && cfgKey(state.cfg) !== cfgKey(owned()); }
  let saveT = null;
  function saveCareer(now) {
    if (!state.career) return;
    const go = () => { if (inCareer()) state.career.working = JSON.parse(JSON.stringify(state.cfg)); LS.set('ts.career', state.career); };
    clearTimeout(saveT);
    if (now) go(); else saveT = setTimeout(go, 400);
  }
  // engine-failure multiplier: difficulty in career; unbought parts are only a simulation
  function failMult() {
    if (!inCareer()) return 1;
    if (pending()) return 0;
    return diffOf().fail;
  }
  function careerBlown() {
    if (!inCareer() || pending()) return '';
    const sv = state.career, D = diffOf();
    sv.stats.blown++;
    if (D.permadeath) {
      const st = Object.assign({}, PRE.BASE, CR.STARTERS[sv.starter].cfg);
      CR.ENGINE_KEYS.forEach(k => { sv.cfg[k] = st[k]; });
      delete sv.working;
      state.cfg = owned();
      saveCareer(true);
      setTimeout(() => { renderParts(); update(); }, 0);
      return '<br><br><b>Hardcore:</b> the engine is scrap. You’re back on the stock starter engine (car parts kept).';
    }
    const bill = Math.round(state.an.cost * D.repair);
    sv.cash -= bill;
    saveCareer(true); renderCareerBar();
    return `<br><br><b>Repair bill: ${money(bill)}</b> (${Math.round(D.repair * 100)}% of the engine’s value).`;
  }
  function lockedTier(id, v) { if (!inCareer()) return 0; const t = CR.lockTier(id, v); return t > state.career.tier ? t : 0; }
  function rangeBounds(k, c) {
    let mn = val(k.min, c), mx = val(k.max, c);
    if (inCareer()) {
      const cap = CR.maxFor(k.id, state.career.tier); if (cap != null) mx = Math.min(mx, cap);
      const lo = CR.minFor(k.id, state.career.tier, state.career); if (lo != null) mn = Math.max(mn, lo);
    }
    return [mn, Math.max(mn, mx)];
  }

  /* ----- mode switch ----- */
  function setMode(m) {
    if (m === state.mode) return;
    if (sim.mode === 'dyno' || sim.mode === 'drag') { toast('Finish the current run first'); syncModeUI(); return; }
    if (m === 'career') {
      state.sandboxCfg = JSON.parse(JSON.stringify(state.cfg)); state.sandboxBase = state.base; state.base = null; $('#btnUnpin').hidden = true;
      state.mode = 'career';
      if (state.career) loadCareerCfg();
    } else {
      if (state.career) saveCareer(true);
      state.mode = 'sandbox';
      state.cfg = Object.assign({}, PRE.BASE, state.sandboxCfg || startPreset.cfg);
      state.base = state.sandboxBase || null; $('#btnUnpin').hidden = !state.base;
      renderParts(); update();
    }
    syncModeUI();
    setView(m === 'career' ? 'career' : 'dyno');
  }
  function loadCareerCfg() {
    const sv = state.career;
    state.cfg = Object.assign({}, PRE.BASE, sv.working || sv.cfg);
    state.fromPreset = null;
    clampRevs(false); renderParts(); update();
  }
  function syncModeUI() {
    const car = state.mode === 'career';
    $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.m === state.mode));
    $('#presetSel').hidden = car; $('#btnSave').hidden = car; $('#btnPin').hidden = car;
    $$('#viewTabs button').forEach(b => { const v = b.dataset.view; if (v === 'garage' || v === 'challenges') b.hidden = car; if (v === 'career') b.hidden = !car; });
    renderCareerBar();
  }
  $('#modeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.m); });

  /* ----- shop bar (top of the parts panel) ----- */
  function renderCareerBar() {
    const el = $('#careerBar');
    if (!inCareer()) { el.hidden = true; return; }
    const sv = state.career; el.hidden = false;
    const pend = pending();
    const cost = pend ? CR.changeCost(owned(), state.cfg, sv) : 0;
    el.innerHTML = `<div class="cb-top"><span class="cash ${sv.cash < 0 ? 'neg' : ''}">${money(sv.cash)}</span><span class="tierb" style="--tc:${CR.TIERS[sv.tier].color}">${tierName(sv.tier)} tier · ${diffOf().name}</span></div>` +
      (pend ? `<div class="cb-pend"><div>${cost >= 0 ? 'Upgrade cost' : 'Parts refund'} <b>${cost >= 0 ? money(cost) : '+' + money(-cost)}</b><small>Previewing unbought parts — dyno &amp; practice runs are simulated and can’t break anything.</small></div>
        <div class="cb-acts"><button class="btn small primary" id="cbBuy" ${cost > sv.cash ? 'disabled title="Not enough cash"' : ''}>${cost >= 0 ? 'Buy & install' : 'Sell parts'}</button><button class="btn small" id="cbRevert">Revert</button></div></div>`
        : `<div class="cb-note">This is your car. Change any part below to see its price, test it on the dyno, then buy it.</div>`);
  }
  $('#careerBar').addEventListener('click', e => {
    if (e.target.id === 'cbBuy') buyChanges(); else if (e.target.id === 'cbRevert') revertChanges();
  });
  function buyChanges() {
    const sv = state.career, cost = CR.changeCost(owned(), state.cfg, sv);
    if (cost > sv.cash) { toast('Not enough cash'); return; }
    if (sim.mode === 'blown') { toast('Rebuild the engine first'); return; }
    sv.cash -= cost; sv.cfg = JSON.parse(JSON.stringify(state.cfg)); delete sv.working;
    saveCareer(true);
    toast(cost >= 0 ? `Bought & installed for ${money(cost)}` : `Sold parts for ${money(-cost)}`);
    renderCareerBar(); renderCareer();
  }
  function revertChanges() {
    const sv = state.career; delete sv.working;
    state.cfg = owned(); saveCareer(true); renderParts(); update(); toast('Reverted to your current car');
  }

  /* ----- events ----- */
  const winsInTier = t => CR.EVENTS.filter(e => e.tier === t && !e.boss && state.career.wins[e.id]).length;
  const estCache = new Map();
  function myEstimate(ev) {
    const key = cfgKey(state.cfg) + '|' + ev.dist;
    if (!estCache.has(key)) {
      if (estCache.size > 200) estCache.clear();
      estCache.set(key, E.dragSim(state.cfg, state.an, { dist: ev.dist }).marks.fin);
    }
    return estCache.get(key);
  }
  function scaledRival(baseName, target, dist) {
    const p = PRE.PRESETS.find(x => x.name === baseName) || PRE.PRESETS[2];
    const res = E.dragSim(p.cfg, E.analyze(p.cfg), { dist });
    const f = target / res.marks.fin;   // re-time the rival's run to hit its target exactly
    res.frames = res.frames.map(fr => Object.assign({}, fr, { t: fr.t * f, v: fr.v / f }));
    const m = {};
    ['ft60', 'ft330', 'e8', 'q', 'fin'].forEach(k => { if (res.marks[k]) m[k] = res.marks[k] * f; });
    ['trap8', 'trap', 'trapFin'].forEach(k => { if (res.marks[k]) m[k] = res.marks[k] / f; });
    for (const fr of res.frames) {
      const mph = fr.v * 2.23694;
      if (!m.t60 && mph >= 60) m.t60 = fr.t;
      if (!m.t100k && fr.v * 3.6 >= 100) m.t100k = fr.t;
      if (!m.t100 && mph >= 100) m.t100 = fr.t;
    }
    res.marks = m; res.topSpeed /= f;
    return res;
  }
  function eventBlock(ev) {
    const sv = state.career;
    if (ev.boss && winsInTier(ev.tier) < CR.BOSS_UNLOCK_WINS) return `Win ${CR.BOSS_UNLOCK_WINS} ${tierName(ev.tier)} events to unlock (${winsInTier(ev.tier)}/${CR.BOSS_UNLOCK_WINS})`;
    if (CR.checkReq(ev.req, state.cfg, state.an).some(r => !r.ok)) return 'Your car doesn’t meet the rules';
    if (pending()) return 'Buy or revert your parts changes first';
    if (sv.cash < ev.fee) return 'Not enough cash for the entry fee';
    if (sim.mode === 'blown') return 'Rebuild your engine first';
    if (sim.mode === 'dyno' || (sim.drag && !sim.drag.done)) return 'A run is in progress';
    return '';
  }
  function startEvent(id) {
    const ev = CR.EVENTS.find(e => e.id === id);
    const sv = state.career, D = diffOf();
    const why = eventBlock(ev);
    if (why) { toast(why); return; }
    sv.cash -= ev.fee; sv.stats.races++; saveCareer(true); renderCareerBar();
    if (ev.type === 'dyno') startDyno({ onDone: r => finishEvent(ev, r) });
    else {
      const g = (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
      const res = scaledRival(ev.base, ev.target * D.rival * (1 + 0.006 * g), ev.dist);
      runDrag({ dist: ev.dist, rival: { name: ev.rival, res }, onDone: r => finishEvent(ev, r) });
    }
  }
  function unlocksFor(t) {
    const out = [];
    Object.entries(CR.LOCKS).forEach(([id, m]) => Object.entries(m).forEach(([v, tier]) => {
      if (tier !== t) return;
      const k = CONTROLS.find(x => x.id === id);
      if (!k) return;
      if (k.type === 'toggle') { out.push(v === 'true' ? k.label : `${k.label} off`); return; }
      const opts = k.options ? val(k.options, Object.assign({}, state.cfg, { layout: id === 'cyl' ? 'V' : state.cfg.layout })) : [];
      const o = opts.find(([ov]) => String(ov) === v);
      out.push(o ? `${id === 'cyl' ? 'Cylinders' : val(k.label, state.cfg)}: ${String(o[1]).replace(/ \(.*\)$/, '')}` : `${id} ${v}`);
    }));
    Object.entries(CR.MAXES).forEach(([id, arr]) => {
      if (arr[t] === arr[t - 1]) return;
      const k = CONTROLS.find(x => x.id === id); if (!k) return;
      out.push(`${k.label} up to ${arr[t].toLocaleString()}${k.unit ? ' ' + k.unit : id === 'boost' ? ' psi' : ''}`);
    });
    if (t > 0) out.push('lighter chassis & sleeker aero');
    return out;
  }
  function finishEvent(ev, r) {
    const sv = state.career, D = diffOf();
    let win = false, line;
    if (r.aborted) line = 'You left mid-event, so it counts as a forfeit.';
    else if (r.blown) line = 'Your engine let go mid-event. No prize this time.';
    else if (ev.type === 'dyno') { win = r.hp >= ev.target; line = `The dyno read <b>${Math.round(r.hp)} hp</b> — you needed ${ev.target.toLocaleString()}.`; }
    else {
      win = r.win;
      line = win ? `<b>${r.me.fin.toFixed(3)} s</b> beat ${esc(ev.rival)} (${r.rv.fin.toFixed(3)} s) by ${r.margin.toFixed(3)} s.`
        : `<b>${r.me.fin.toFixed(3)} s</b> lost to ${esc(ev.rival)} (${r.rv.fin.toFixed(3)} s) by ${(-r.margin).toFixed(3)} s.`;
      if (ev.dist > 300 && r.me.fin) sv.stats.best = Math.min(sv.stats.best || 99, r.me.fin);
    }
    let extra = '';
    if (win) {
      const prize = Math.round(ev.prize * D.prize * (sv.wins[ev.id] ? 0.5 : 1));
      sv.cash += prize; sv.stats.wins++; sv.stats.earned += prize; sv.wins[ev.id] = (sv.wins[ev.id] || 0) + 1;
      extra += `<div class="prize">+${money(prize)}</div>`;
      if (ev.boss && sv.tier === ev.tier && sv.tier < CR.TIERS.length - 1) {
        sv.tier++;
        extra += `<p><b>Promoted to ${tierName(sv.tier)} tier!</b><br><span class="unl">Unlocked: ${unlocksFor(sv.tier).join(' · ')}</span></p>`;
        renderParts();
      }
      if (ev.final && !sv.finished) {
        sv.finished = true;
        extra += `<p><b>Career complete on ${D.name}.</b> ${sv.stats.wins} wins from ${sv.stats.races} starts, ${sv.stats.blown} engines destroyed, ${money(sv.stats.earned)} earned.</p>`;
      }
    } else if (!r.blown) extra = '<p>Back to the shop — check the dyno and the rival’s time.</p>';
    saveCareer(true);
    showResult(win ? (ev.final ? '🏆 You are a LEGEND' : ev.boss ? '👑 Boss defeated!' : 'Victory!') : r.blown ? '💥 DNF' : r.aborted ? 'Forfeit' : 'Defeat', `<div class="ev-name">${esc(ev.name)}</div>${line}${extra}`, win);
    renderCareerBar(); renderCareer();
  }
  function showResult(title, html, win) {
    $('#resTitle').textContent = title;
    $('#resBody').innerHTML = html;
    $('#resModal').classList.toggle('win', !!win);
    $('#resModalBg').hidden = false;
  }
  $('#resBack').addEventListener('click', () => { $('#resModalBg').hidden = true; setView('career'); });
  $('#resStay').addEventListener('click', () => { $('#resModalBg').hidden = true; });

  /* ----- career view ----- */
  const setup = { diff: 'normal', starter: 'hatch' };
  let abandonArmed = 0;
  function renderCareer() {
    if (state.view !== 'career') return;
    const root = $('#view-career');
    if (!state.career) { root.innerHTML = setupHTML(); return; }
    root.innerHTML = dashHTML();
  }
  function setupHTML() {
    const diffs = Object.entries(CR.DIFFICULTY).map(([k, d]) => `<button class="gcard pick ${setup.diff === k ? 'sel' : ''}" data-diff="${k}"><h4>${d.name}</h4><p>${d.blurb}</p>
      <div class="kv"><span>Starting cash</span><b>${money(d.cash)}</b><span>Prize money</span><b>×${d.prize}</b><span>Part prices</span><b>×${d.price}</b><span>Rival pace</span><b>${d.rival < 1 ? Math.round((1 - d.rival) * 100) + '% quicker' : d.rival > 1 ? Math.round((d.rival - 1) * 100) + '% slower' : 'as listed'}</b><span>Blow-up risk</span><b>×${d.fail}</b><span>Blown engine</span><b>${d.permadeath ? 'engine scrapped' : Math.round(d.repair * 100) + '% repair'}</b></div></button>`).join('');
    const starters = Object.entries(CR.STARTERS).map(([k, st]) => {
      const c = Object.assign({}, PRE.BASE, st.cfg), a = E.analyze(c), d = E.dragSim(c, a, {});
      return `<button class="gcard pick ${setup.starter === k ? 'sel' : ''}" data-starter="${k}"><h4>${st.title}</h4><p>${st.blurb}</p><div class="specs">${Math.round(hpOf(a.peakP))} hp · ${Math.round(c.chassis + a.mass + 75)} kg · ${d.marks.fin.toFixed(2)} s ¼ mile</div></button>`;
    }).join('');
    return `<div class="career-hero"><h2>Career mode</h2><p>Start with a tired project car and a little cash. Win races and dyno days for prize money, buy parts, climb from the <b>Street</b> scene to <b>Legend</b>, and beat Doc Torque. Better parts unlock as you get promoted. Blow up the engine and you pay for it.</p></div>
      <div class="sec-h">1 · Difficulty</div><div class="grid-cards">${diffs}</div>
      <div class="sec-h">2 · Starter car</div><div class="grid-cards">${starters}</div>
      <button class="btn primary big-btn" id="btnStartCareer">Start career →</button>`;
  }
  function evCard(ev) {
    const sv = state.career, D = diffOf();
    const won = sv.wins[ev.id] || 0;
    const prize = Math.round(ev.prize * D.prize * (won ? 0.5 : 1));
    const reqs = CR.checkReq(ev.req, state.cfg, state.an);
    const why = eventBlock(ev);
    let goal, mine;
    if (ev.type === 'dyno') { goal = `Make <b>${ev.target.toLocaleString()} hp</b> on the dyno`; mine = `You make ${Math.round(hpOf(state.an.peakP))} hp`; }
    else {
      const tgt = ev.target * D.rival, est = myEstimate(ev);
      goal = `${esc(ev.rival)} runs ≈ <b>${tgt.toFixed(2)} s</b> · ${ev.dist < 300 ? '⅛' : '¼'} mile`;
      mine = `You run ≈ ${est ? est.toFixed(2) : '—'} s ${est ? (est < tgt ? '<span class="good">✓ faster</span>' : '<span class="bad">✗ slower</span>') : ''}`;
    }
    return `<div class="gcard ev ${ev.boss ? 'boss' : ''} ${won ? 'won' : ''}">
      <div class="ev-h"><h4>${ev.type === 'dyno' ? '📈 ' : '🏁 '}${esc(ev.name)}</h4>${won ? `<span class="wonb">Won${won > 1 ? ' ×' + won : ''}</span>` : ''}</div>
      ${ev.flavor ? `<p>${esc(ev.flavor)}</p>` : ''}
      <div class="goal">${goal}</div><div class="mine">${mine}</div>
      ${reqs.length ? `<ul class="reqs">${reqs.map(r => `<li class="${r.ok ? 'ok' : 'no'}">${r.ok ? '✓' : '✗'} ${esc(r.text)}</li>`).join('')}</ul>` : ''}
      <div class="ev-f"><span>Entry ${ev.fee ? money(ev.fee) : 'free'} · Prize <b>${money(prize)}</b>${won ? ' (replay)' : ''}</span>
      <button class="btn small ${why ? '' : 'primary'}" data-event="${ev.id}" ${why ? `disabled title="${esc(why)}"` : ''}>${ev.type === 'dyno' ? 'Strap in' : 'Race'}</button></div>
      ${why ? `<div class="why">${esc(why)}</div>` : ''}</div>`;
  }
  function dashHTML() {
    const sv = state.career, D = diffOf(), an = state.an;
    const val0 = CR.value(owned(), sv);
    const cur = CR.EVENTS.filter(e => e.tier === sv.tier);
    const past = CR.EVENTS.filter(e => e.tier < sv.tier);
    const next = sv.tier < CR.TIERS.length - 1 ? unlocksFor(sv.tier + 1) : [];
    return `${sv.finished ? `<div class="legend-banner">🏆 LEGEND — career complete on ${D.name}. Keep racing for fun.</div>` : ''}
      <div class="tiles">
        <div class="tile"><div class="k">Cash</div><div class="v ${sv.cash < 0 ? 'bad' : ''}">${money(sv.cash)}</div><div class="s">${money(sv.stats.earned)} earned</div></div>
        <div class="tile"><div class="k">Tier</div><div class="v" style="color:${CR.TIERS[sv.tier].color}">${tierName(sv.tier)}</div><div class="s">${D.name} difficulty</div></div>
        <div class="tile"><div class="k">Record</div><div class="v">${sv.stats.wins}<small>W</small> ${sv.stats.races - sv.stats.wins}<small>L</small></div><div class="s">${sv.stats.blown} engines blown</div></div>
        <div class="tile"><div class="k">Your car</div><div class="v">${Math.round(hpOf(an.peakP))}<small>hp</small></div><div class="s">worth ${money(val0)}</div></div>
        <div class="tile"><div class="k">Best ¼ mile</div><div class="v">${sv.stats.best ? sv.stats.best.toFixed(3) : '—'}<small>s</small></div><div class="s">${esc(state.cfg.name)}</div></div>
      </div>
      ${pending() ? `<div class="warn"><span class="ico" style="background:var(--warning)">!</span><div><b>Unbought parts on your car.</b> Buy or revert them in the shop panel (left) before entering events.</div></div>` : ''}
      ${sv.cash < 0 ? `<div class="warn"><span class="ico" style="background:var(--critical)">!</span><div><b>You’re in debt.</b> Win the free Parking Lot Meet or sell parts (downgrade in the shop) to get back on your feet.</div></div>` : ''}
      <div class="sec-h">${tierName(sv.tier)} events <span class="prog">· boss unlocks after ${CR.BOSS_UNLOCK_WINS} wins (${Math.min(winsInTier(sv.tier), CR.BOSS_UNLOCK_WINS)}/${CR.BOSS_UNLOCK_WINS})</span></div>
      <div class="grid-cards">${cur.map(evCard).join('')}</div>
      ${next.length ? `<div class="sec-h">Unlocks at ${tierName(sv.tier + 1)}</div><div class="ok-line unl">${next.join(' · ')}</div>` : ''}
      ${past.length ? `<details class="table past"><summary>Earlier tiers — replays pay 50%</summary><div class="grid-cards" style="margin-top:10px">${past.map(evCard).join('')}</div></details>` : ''}
      <div class="sec-h">Danger zone</div><button class="btn small ghost" id="btnAbandon">${abandonArmed ? 'Click again to really abandon' : 'Abandon career'}</button>`;
  }
  $('#view-career').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.diff) { setup.diff = t.dataset.diff; renderCareer(); }
    else if (t.dataset.starter) { setup.starter = t.dataset.starter; renderCareer(); }
    else if (t.id === 'btnStartCareer') {
      state.career = CR.newSave(setup.diff, setup.starter);
      if (sim.mode === 'blown') { sim.mode = 'off'; updateStartBtn(); }
      loadCareerCfg(); saveCareer(true); syncModeUI(); renderCareer();
      toast(`Career started — ${money(state.career.cash)} in the bank. Check the shop on the left.`);
    } else if (t.dataset.event) { ensureAudio(); startEvent(t.dataset.event); }
    else if (t.id === 'btnAbandon') {
      if (abandonArmed && Date.now() - abandonArmed < 4000) {
        abandonArmed = 0; state.career = null; LS.set('ts.career', null); syncModeUI(); renderCareer(); toast('Career abandoned');
      } else { abandonArmed = Date.now(); renderCareer(); setTimeout(() => { abandonArmed = 0; renderCareer(); }, 4000); }
    }
  });


  /* =================================================================
     3D TEST TRACK — live, driver-controlled straight-line physics
     ================================================================= */
  const MPS = { mph: 0.44704, kmh: 1 / 3.6 };
  const drv = { x: 0, v: 0, gear: 0, gas: false, brake: false, auto: true, shiftLeft: 0, launchFrom: 0, run: null, last: null, best: {}, bestKey: '',
    wheelV: 0, spin: false, slip: 0, acc: 0, flame: 0, tripL: 0, tripM: 0, brk: E.newBrakeState(), bp: 0, bres: null, chute: false, stop: null, lastStop: null, tree: 0, stageT: 0, cutOn: false, msg: '', msgT: 0, S: null, inited: false, jumped: false };
  function driveSetup() { drv.S = E.carSetup(state.cfg, state.an); if (drv.gear >= drv.S.ratios.length) drv.gear = drv.S.ratios.length - 1; }
  function driveMsg(m, t) { drv.msg = m; drv.msgT = t || 2.2; }
  function shiftGear(d, manual) {
    const S = drv.S, n = S.ratios.length, g = drv.gear + d;
    if (g < 0 || g >= n || drv.shiftLeft > 0) return;
    if (manual && d < 0 && drv.v > 0.5) {
      const rpmNew = drv.v / S.rw / (2 * Math.PI) * 60 * S.ratios[g];
      if (rpmNew > state.cfg.redline * 1.04) { driveMsg('Too fast for that gear — would over-rev!', 1.4); return; }
    }
    drv.gear = g; drv.shiftLeft = S.shiftT;
    EngineAudio.event({ type: 'shift', amt: 0.6 });
    if (d > 0 && (state.cfg.pops !== 'off' || state.cfg.antilag) && drv.gas) drv.flame = 0.12;
  }
  function driveResetRun(toStart) {
    drv.run = null; drv.v = 0; drv.gear = 0; drv.spin = false; drv.slip = 0; drv.wheelV = 0; drv.shiftLeft = 0;
    if (toStart) drv.x = 0;
    drv.tree = 0; drv.stageT = 0; drv.chute = false;
    if (toStart) { drv.tripL = 0; drv.tripM = 0; }
  }
  const DMARKS = [['ft60', 18.288], ['ft330', 100.584], ['e8', 201.168], ['q', 402.336], ['half', 804.672], ['mile', 1609.344]];
  const SMARKS = [['s60', 60 * MPS.mph], ['s100k', 100 * MPS.kmh], ['s100', 100 * MPS.mph], ['s130', 130 * MPS.mph], ['s200k', 200 * MPS.kmh], ['s150', 150 * MPS.mph], ['s300k', 300 * MPS.kmh], ['s200', 200 * MPS.mph]];
  const LABEL_D = { e8: '1/8 mile', q: '1/4 mile', half: '1/2 mile', mile: '1 mile' };
  function runTiming(dt, prevV) {
    const r = drv.run; if (!r || r.done) return;
    r.t += dt;
    const d = drv.x - r.x0, m = r.m;
    DMARKS.forEach(([k, dist]) => { if (!m[k] && d >= dist) { m[k] = { t: r.t, v: drv.v }; if (LABEL_D[k]) driveMsg(`${LABEL_D[k]}: ${r.t.toFixed(3)} s @ ${spdTxt(drv.v)}`, 2.6); } });
    SMARKS.forEach(([k, v]) => { if (!m[k] && drv.v >= v) m[k] = r.t; });
    r.vmax = Math.max(r.vmax, drv.v);
    if (drv.brake && prevV >= 60 * MPS.mph && drv.v < 60 * MPS.mph) r.b0 = drv.x;
    if (drv.brake && prevV >= 100 / 3.6 && drv.v < 100 / 3.6) r.b100 = drv.x;
    if (drv.brake && prevV >= 200 / 3.6 && drv.v < 200 / 3.6) r.b200 = drv.x;
    if (!drv.brake) { if (drv.v > 60 * MPS.mph) r.b0 = null; if (drv.v > 100 / 3.6) r.b100 = null; if (drv.v > 200 / 3.6) r.b200 = null; }
    if (drv.v <= 0 && d > 1) {
      if (r.b0 != null) m.brake60 = drv.x - r.b0;
      if (r.b100 != null) m.brake100 = drv.x - r.b100;
      if (r.b200 != null) m.brake200 = drv.x - r.b200;
      r.peakBrakeT = drv.brk.T;
      r.fuelUsed = drv.tripL - r.fuel0; r.done = true; drv.last = r; updateBests(r);
      driveMsg(`Run complete — top speed ${spdTxt(r.vmax)}. Press R for the start line or launch again.`, 4);
    }
  }
  function updateBests(r) {
    const key = cfgKeyLite(); if (drv.bestKey !== key) { drv.best = {}; drv.bestKey = key; }
    const b = drv.best, m = r.m;
    const lo = (k, v) => { if (v != null && isFinite(v) && (b[k] == null || v < b[k])) b[k] = v; };
    DMARKS.forEach(([k]) => { if (m[k]) { if (b[k] == null || m[k].t < b[k].t) b[k] = m[k]; } });
    SMARKS.forEach(([k]) => lo(k, m[k]));
    if (m.s100k && m.s200k) lo('r100_200k', m.s200k - m.s100k);
    if (m.s60 && m.s130) lo('r60_130', m.s130 - m.s60);
    lo('brake60', m.brake60); lo('brake100', m.brake100); lo('brake200', m.brake200);
    if (b.vmax == null || r.vmax > b.vmax) b.vmax = r.vmax;
  }
  const cfgKeyLite = () => { const o = Object.assign({}, state.cfg); delete o.name; return JSON.stringify(o); };
  drv.kmh = LS.get('ts.dUnits', 'kmh') === 'kmh';
  const spdTxt = v => drv.kmh ? `${(v * 3.6).toFixed(1)} km/h` : `${(v / MPS.mph).toFixed(1)} mph`;

  // brake hydraulics: pressure builds over ~0.15 s (taps modulate), then the brake model
  function brakeForce(dt) {
    drv.bp += ((drv.brake ? 1 : 0) - drv.bp) * Math.min(1, dt / (drv.brake ? 0.15 : 0.08));
    const r = E.brakeStep(state.cfg, drv.S, drv.brk, drv.bp, drv.v, Math.max(0, -drv.acc), dt);
    drv.bres = r;
    // track the current stop: speed at first touch, distance, peak deceleration, peak rotor temp
    if (drv.brake && drv.v > 3 && !drv.stop) drv.stop = { v0: drv.v, x0: drv.x, peak: 0, Tpk: 0, live: true };
    if (drv.stop && drv.stop.live) {
      drv.stop.peak = Math.max(drv.stop.peak, Math.max(0, -drv.acc));
      drv.stop.Tpk = Math.max(drv.stop.Tpk, drv.brk.T, drv.brk.Tr);
      drv.stop.d = drv.x - drv.stop.x0;
      if (drv.v <= 0.05) { drv.stop.live = false; drv.stop.vEnd = 0; drv.lastStop = drv.stop; drv.stop = null; }
      else if (!drv.brake && drv.bp < 0.05) { drv.stop.live = false; drv.stop.vEnd = drv.v; drv.lastStop = drv.stop; drv.stop = null; }
    }
    return r.F;
  }
  function chuteDrag() { return drv.chute && drv.v > 0.5 ? 0.5 * 1.2 * 2.6 * drv.v * drv.v : 0; }
  function driveCoast(dt) {
    // engine off / cranking: the car just rolls to a stop
    const S = drv.S; if (!S) return;
    const Fb = brakeForce(dt);
    const F = 0.5 * 1.2 * S.CdA * drv.v * drv.v + (drv.v > 0 ? 0.013 * S.mass * S.g9 : 0) + Fb + chuteDrag();
    const pv = drv.v;
    drv.v = Math.max(0, drv.v - F / (S.mass * 1.04) * dt); drv.x += drv.v * dt; drv.wheelV = drv.v; drv.spin = false;
    runTiming(dt, pv);
  }
  function driveStep(dt) {
    const c = state.cfg, an = state.an, S = drv.S;
    const gas = drv.gas ? 1 : 0, brake = drv.brake ? 1 : 0;
    const pv = drv.v;
    if (drv.flame > 0) drv.flame -= dt;
    // ---- at rest: idle, or launch control on the brake ----
    if (drv.v < 0.25 && (brake || !gas)) {
      drv.v = 0; drv.gear = 0; drv.wheelV = 0; drv.spin = false; drv.slip = 0; drv.shiftLeft = 0;
      if (drv.run && !drv.run.done) runTiming(dt, pv);
      const armed = brake && gas;
      brakeForce(dt);
      if (drv.chute) drv.chute = false;
      freeStep(dt, gas, armed ? c.launchRpm : c.redline);
      sim.gearA = 0;
      if (armed) { drv.stageT += dt; drv.tree = Math.min(3, 1 + Math.floor(drv.stageT / 0.4)); }
      else if (brake) { drv.stageT = 0; drv.tree = 0; }
      else { drv.stageT = 0; drv.tree = drv.run ? drv.tree : 0; }
      drv.acc = 0;
      return;
    }
    // ---- launch from a standstill ----
    if (drv.v < 0.25 && gas && !brake && (!drv.run || drv.run.done)) {
      drv.run = { t: 0, x0: drv.x, m: {}, vmax: 0, done: false, fuel0: drv.tripL };
      drv.launchFrom = Math.max(sim.rpm, an.idle * 1.3);
      drv.gear = 0;
      drv.jumped = drv.stageT > 0 && drv.stageT < 1.2;
      drv.tree = drv.jumped ? 'red' : 4;
      driveMsg(drv.jumped ? 'RED LIGHT! (left before the tree finished) — run still timed' : 'GO!', 1.2);
      Drive3D.kick(0.5);
    }
    const n = S.ratios.length, ratio = S.ratios[drv.gear];
    const wheelRpm = drv.v / S.rw / (2 * Math.PI) * 60, coupled = wheelRpm * ratio;
    let Fdrive = 0;
    if (drv.shiftLeft > 0) {
      drv.shiftLeft -= dt;
      const keep = (c.gearbox === 'seq' || c.gearbox === 'dct') ? 0.5 : 0;
      sim.thr += (keep * gas - sim.thr) * Math.min(1, dt / 0.03);
      sim.rpm += (coupled - sim.rpm) * Math.min(1, dt / Math.max(0.02, S.shiftT * 0.5));
      sim.load = 0.1; sim.cut = false; sim.torque = 0;
      if (c.antilag) sim.boostF = Math.max(sim.boostF, 0.8);
    } else {
      const slipRpm = gas ? Math.max(drv.launchFrom, an.idle * 1.3) : an.idle * 1.05;
      const slipping = drv.gear === 0 && coupled < slipRpm;
      if (slipping && gas) drv.launchFrom = Math.max(an.idle * 1.3, drv.launchFrom - 400 * dt);
      let rpm = slipping ? slipRpm : coupled;
      const declutch = !slipping && coupled < an.idle;   // rolling too slowly for this gear: clutch in
      if (declutch) rpm = an.idle;
      if (rpm >= c.redline) drv.cutOn = true; else if (rpm < c.redline - Math.max(120, c.redline * 0.015)) drv.cutOn = false;
      const cut = drv.cutOn;
      sim.thr += (gas - sim.thr) * Math.min(1, dt / 0.045);
      const thrMap = Math.pow(sim.thr, 0.6);
      const Tf = frictionT(rpm), Tp = pumpT(sim.thr);
      let T = cut ? -Tf - Tp : thrMap * (engineTorque(rpm, sim.boostF, sim.boostE) + Tf) - Tf - Tp;
      let Tk = 0;
      if (c.mguk && gas && !cut) { Tk = E.hybridTorque(c, rpm); sim.kers = 1; } else sim.kers = 0;
      Fdrive = declutch ? 0 : (T + Tk) * ratio * S.dtEff / S.rw;
      if (slipping && Fdrive < 0) Fdrive = 0;
      sim.rpm = rpm; sim.cut = cut;
      sim.torque = Math.max(0, T);
      sim.load = cut ? 0 : clamp(thrMap * (0.85 + 0.3 * sim.boostF * (hasTurbo() ? 1 : 0)), 0, 1.2);
      const bt = cut ? (c.antilag ? 0.8 : sim.boostF) : thrMap;
      sim.boostF += (bt - sim.boostF) * Math.min(1, dt / (bt > sim.boostF ? tauBoost() : (c.antilag ? 0.8 : 0.18)));
      sim.boostE += ((cut ? 0 : thrMap) - sim.boostE) * Math.min(1, dt / 0.15);
      if (drv.auto && !slipping) {
        if (gas && drv.gear < n - 1 && rpm >= c.redline * 0.975) shiftGear(1);
        else if (drv.gear > 0 && !gas && rpm < Math.max(an.idle * 1.8, c.redline * 0.36)) shiftGear(-1);
        else if (drv.gear > 0 && gas && rpm < c.redline * 0.3) shiftGear(-1);
      }
      if (c.straightCut) { sim.gearF = rpm / 60 * 23; sim.gearA = 0.3 + 0.7 * sim.thr; }
    }
    // tyres
    const tractionK = 1 + (S.drv === 'RWD' ? 0.25 : S.drv === 'FWD' ? -0.1 : 0) * Math.min(1, Math.max(0, Fdrive) / (S.mass * S.g9));
    const traction = S.tire.mu * S.mass * S.g9 * S.driveFrac * tractionK;
    const ex = Fdrive > traction ? Math.min(1.5, Fdrive / traction - 1) : 0;
    drv.slip += (ex - drv.slip) * Math.min(1, dt / 0.12);          // tyre slip builds and fades smoothly
    drv.spin = drv.slip > 0.03;
    if (Fdrive > traction) Fdrive = traction * 0.92;
    if (drv.slip > 0.001 && drv.shiftLeft <= 0) sim.rpm = Math.min(state.cfg.redline, sim.rpm * (1 + 0.12 * drv.slip));
    drv.wheelV = drv.v + (drv.slip > 0.001 ? 2 * Math.min(1, drv.slip * 10) + drv.slip * 10 : 0);
    const Fb = brakeForce(dt);
    const Fa = 0.5 * 1.2 * S.CdA * drv.v * drv.v + chuteDrag(), Fr = 0.013 * S.mass * S.g9;
    // locked driven wheels can't put power down either
    if (drv.bres && ((drv.bres.lockR && S.drv !== 'FWD') || (drv.bres.lockF && S.drv !== 'RWD')) && Fdrive > 0) Fdrive *= 0.3;
    const a = (Fdrive - Fa - Fr - Fb) / (S.mass * 1.04);
    drv.v = Math.max(0, drv.v + a * dt);
    drv.x += drv.v * dt;
    drv.acc += (a - drv.acc) * Math.min(1, dt / 0.15);
    runTiming(dt, pv);
  }

  function driveKey(e, down) {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup') { drv.gas = down; return true; }
    if (k === 's' || k === 'arrowdown' || k === ' ') { drv.brake = down; return true; }
    const up = k === '+' || k === '=' || e.code === 'NumpadAdd' || k === 'e';
    const dn = k === '-' || k === '_' || e.code === 'NumpadSubtract' || k === 'q';
    if (!down || e.repeat) return up || dn || ['m', 'c', 'r', 'p', 'enter'].includes(k);
    if (up || dn) {
      if (drv.auto) toggleTrans();     // touching the shifter takes over from the automatic
      shiftGear(up ? 1 : -1, true); return true;
    }
    if (k === 'p') { deployChute(); return true; }
    if (k === 'm') { toggleTrans(); return true; }
    if (k === 'c') { $('#dCam').textContent = Drive3D.cycleCam(); return true; }
    if (k === 'r') { driveResetRun(true); driveMsg('Back on the start line', 1.5); return true; }
    if (k === 'enter') { toggleEngine(); return true; }
    return false;
  }
  function deployChute() {
    if (!state.cfg.chute) { driveMsg('No parachute fitted — add one in the Brakes tab', 2); return; }
    if (drv.chute) return;
    if (drv.v < 100 / 3.6) { driveMsg('Too slow for the chute (deploy above 100 km/h)', 1.6); return; }
    drv.chute = true; driveMsg('CHUTE OUT!', 1.4); Drive3D.kick(0.3);
  }
  function toggleTrans() { drv.auto = !drv.auto; $('#dTrans').textContent = drv.auto ? 'Auto shift' : 'Manual (+ / −)'; driveMsg(drv.auto ? 'Automatic shifting' : 'Manual: + to upshift, − to downshift', 2); }
  function holdBtn(el, on, off) {
    el.addEventListener('pointerdown', ev => { ev.preventDefault(); try { el.setPointerCapture(ev.pointerId); } catch (x) { /* ignore */ } el.classList.add('down'); on(); });
    const up = () => { el.classList.remove('down'); off(); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
  }
  holdBtn($('#dGas'), () => { ensureAudio(); drv.gas = true; if (sim.mode === 'off') startEngine(); else if (sim.mode === 'blown') $('#blown').hidden = false; }, () => { drv.gas = false; });
  holdBtn($('#dBrake'), () => { drv.brake = true; }, () => { drv.brake = false; });
  $('#dUp').addEventListener('click', () => { if (drv.auto) toggleTrans(); shiftGear(1, true); });
  $('#dDown').addEventListener('click', () => { if (drv.auto) toggleTrans(); shiftGear(-1, true); });
  $('#dTrans').addEventListener('click', toggleTrans);
  $('#dCam').addEventListener('click', () => { $('#dCam').textContent = Drive3D.cycleCam(); });
  $('#dReset').addEventListener('click', () => { driveResetRun(true); driveMsg('Back on the start line', 1.5); });
  $('#dUnits').textContent = drv.kmh ? 'km/h' : 'mph';
  $('#dUnits').addEventListener('click', () => { drv.kmh = !drv.kmh; LS.set('ts.dUnits', drv.kmh ? 'kmh' : 'mph'); $('#dUnits').textContent = drv.kmh ? 'km/h' : 'mph'; renderDriveBoard(); });
  $('#dClear').addEventListener('click', () => { drv.best = {}; drv.last = null; renderDriveBoard(true); });

  // a drag run or dyno pull can't keep control of the engine while you drive the 3D car
  function abortRuns() {
    let cb = null;
    if (sim.mode === 'drag' && sim.drag) {
      cb = sim.drag.opts && sim.drag.opts.onDone;
      sim.drag.done = true; sim.drag = null; sim.mode = 'run'; sim.thr = 0;
      $('#btnRun').disabled = false; $('#slip').innerHTML = '';
    } else if (sim.mode === 'dyno' && sim.dyno) {
      cb = sim.dyno.opts && sim.dyno.opts.onDone;
      sim.dyno = null; sim.mode = 'run'; liveRpm = null; sim.thr = 0; $('#btnDyno').textContent = 'Dyno pull'; renderCharts();
    } else return;
    updateStartBtn();
    if (cb) cb({ aborted: true }); else toast('Run cancelled — you left for the test track');
  }
  function enterDrive() {
    abortRuns();
    if (!drv.inited) {
      let ok = false;
      try { ok = Drive3D.init($('#driveStage')); } catch (e) { ok = false; console.warn(e); }
      $('#dNoGL').hidden = ok;
      drv.inited = true;
    } else Drive3D.resize();
    driveSetup();
    driveMsg(sim.mode === 'off' ? 'Press GAS (or Enter) to start the engine' : 'Hold BRAKE, add GAS to arm launch control, then release BRAKE', 1.5);
  }
  function leaveDrive() { drv.gas = false; drv.brake = false; drv.v = 0; drv.spin = false; if (drv.run && !drv.run.done) drv.run = null; }

  function fmtSec(v) { return v == null ? '—' : v.toFixed(v < 10 ? 3 : 2) + ' s'; }
  const distTxt = m => drv.kmh ? `${m.toFixed(m < 100 ? 1 : 0)} m` : `${(m * 3.28084).toFixed(0)} ft`;
  let boardT = 0;
  function renderDriveBoard(force) {
    const r = drv.last && (!drv.run || drv.run.done) ? drv.last : drv.run;
    const m = r ? r.m : {}, b = drv.best;
    const et = (x) => x ? `${fmtSec(x.t)} <small>@ ${spdTxt(x.v)}</small>` : '—';
    const rows = [
      ['60 ft', m.ft60 ? fmtSec(m.ft60.t) : '—', b.ft60 ? fmtSec(b.ft60.t) : '—'],
      ['0–60 mph', fmtSec(m.s60), fmtSec(b.s60)],
      ['0–100 km/h', fmtSec(m.s100k), fmtSec(b.s100k)],
      ['0–100 mph', fmtSec(m.s100), fmtSec(b.s100)],
      ['0–200 km/h', fmtSec(m.s200k), fmtSec(b.s200k)],
      ['100–200 km/h', m.s100k && m.s200k ? fmtSec(m.s200k - m.s100k) : '—', fmtSec(b.r100_200k)],
      ['60–130 mph', m.s60 && m.s130 ? fmtSec(m.s130 - m.s60) : '—', fmtSec(b.r60_130)],
      ['0–200 mph', fmtSec(m.s200), fmtSec(b.s200)],
      ['1/8 mile', et(m.e8), et(b.e8)],
      ['1/4 mile', et(m.q), et(b.q)],
      ['1/2 mile', et(m.half), et(b.half)],
      ['1 mile', et(m.mile), et(b.mile)],
      ['Top speed', r ? spdTxt(r.vmax) : '—', b.vmax ? spdTxt(b.vmax) : '—'],
      ['Fuel used', r && r.fuelUsed != null ? r.fuelUsed.toFixed(3) + ' L' : r ? (drv.tripL - r.fuel0).toFixed(3) + ' L' : '—', '—'],
      ['60–0 mph braking', m.brake60 ? distTxt(m.brake60) : '—', b.brake60 ? distTxt(b.brake60) : '—'],
      ['100–0 km/h braking', m.brake100 ? distTxt(m.brake100) : '—', b.brake100 ? distTxt(b.brake100) : '—'],
      ['200–0 km/h braking', m.brake200 ? distTxt(m.brake200) : '—', b.brake200 ? distTxt(b.brake200) : '—'],
    ];
    $('#dTable').innerHTML = `<table class="dt dboard"><thead><tr><th>Metric</th><th>${drv.run && !drv.run.done ? 'This run (live)' : 'Last run'}</th><th>Best</th></tr></thead><tbody>${rows.map(([k, a, bb]) => `<tr><td>${k}</td><td>${a}</td><td>${bb}</td></tr>`).join('')}</tbody></table>`;
  }
  function tempColor(T) {
    const P = E.PADS[state.cfg.pads], fadeT = P.fadeT + E.BRAKES[state.cfg.brakes].fade;
    if (T < P.warmT) return '#6db3ff';                                     // below the pad's window: cold
    if (T < fadeT * 0.8) return '#4cc24c';                                 // happy
    if (T < fadeT) return '#fab219';                                       // getting hot
    return T < fadeT + 150 ? '#ff8a3b' : '#ff3b3b';                        // fading
  }
  function renderBrakePanel() {
    const c = state.cfg, st = drv.brk, r = drv.bres || {};
    const P = E.PADS[c.pads], B = E.BRAKES[c.brakes], FL = E.FLUIDS[c.fluid];
    const fadeT = P.fadeT + B.fade, max = Math.max(1000, fadeT + 200);
    const bar = (T, marks, col) => `<div class="bk-bar"><i style="width:${clamp(T / max, 0, 1) * 100}%;background:${col}"></i>${marks.map(([t, cl]) => `<em class="${cl || ''}" style="left:${t / max * 100}%"></em>`).join('')}</div>`;
    const wheel = T => `<div class="bk-w" style="background:${tempColor(T)}">${Math.round(T)}°</div>`;
    let status, sc;
    if (r.boil) { status = 'FLUID BOILING'; sc = '#ff3b3b'; }
    else if (r.lockF || r.lockR) { status = r.lockR && !r.lockF ? 'REARS LOCKED' : r.lockF && !r.lockR ? 'FRONTS LOCKED' : 'ALL LOCKED'; sc = '#ff3b3b'; }
    else if (r.fade) { status = `FADE — ${r.fadeF ? 'fronts' : 'rears'} overheated`; sc = '#ff8a3b'; }
    else if (r.abs) { status = 'ABS ACTIVE'; sc = '#fab219'; }
    else if (r.cold) { status = 'PADS COLD'; sc = '#6db3ff'; }
    else { status = 'OK'; sc = 'rgba(76,194,76,0.85)'; }
    const S = drv.S, kg = S ? Math.round(S.mass) : 0;
    let stopTxt;
    const sp = v => drv.kmh ? Math.round(v * 3.6) : Math.round(v / MPS.mph);
    if (drv.stop) stopTxt = `Stopping from <b>${sp(drv.stop.v0)}</b> · <b>${distTxt(drv.stop.d || 0)}</b>`;
    else if (drv.lastStop) { const L = drv.lastStop; stopTxt = `Last: <b>${sp(L.v0)}→${sp(L.vEnd)}</b> in <b>${distTxt(L.d)}</b> · ${(L.peak / 9.81).toFixed(2)} g`; }
    else stopTxt = 'Hit the brakes to measure a stop';
    const m = (drv.run && drv.run.m) || {}, b = drv.best;
    const row = (k, cur, best) => `<div class="r"><span>${k}</span>${cur != null ? `<b class="${best != null && Math.abs(cur - best) < 1e-9 ? 'new' : ''}">${distTxt(cur)}</b>` : `<b class="pend">${best != null ? distTxt(best) : '—'}</b>`}</div>`;
    const last = drv.last ? drv.last.m : {};
    $('#dBrakes').innerHTML = `<h5><span>Brakes</span><span>${kg.toLocaleString()} kg</span></h5>
      <div class="bk-car">${wheel(st.T)}<div class="bk-body">pads<br><b>${Math.round((r.bite || 1) * 100)}%</b> bite</div>${wheel(st.T)}${wheel(st.Tr)}${wheel(st.Tr)}</div>
      <div class="bk-row"><span>Front</span>${bar(st.T, [[P.warmT, 'w'], [fadeT]], tempColor(st.T))}<b>${Math.round(st.T)}°</b></div>
      <div class="bk-row"><span>Rear</span>${bar(st.Tr, [[P.warmT, 'w'], [fadeT]], tempColor(st.Tr))}<b>${Math.round(st.Tr)}°</b></div>
      <div class="bk-row"><span>Fluid</span>${bar(st.Tf * max / 400, [[FL.boil * max / 400]], st.Tf > FL.boil ? '#ff3b3b' : st.Tf > FL.boil * 0.85 ? '#fab219' : '#4cc24c')}<b>${Math.round(st.Tf)}°</b></div>
      <div class="bk-status" style="background:${sc};color:#111">${status}</div>
      <h5 class="sp"><span>Braking distance</span><span>${drv.kmh ? 'm' : 'ft'}</span></h5>
      <div class="bk-stop">${stopTxt}</div>
      ${row('100–0 km/h', m.brake100 != null ? m.brake100 : last.brake100, b.brake100)}
      ${row('200–0 km/h', m.brake200 != null ? m.brake200 : last.brake200, b.brake200)}
      ${row('60–0 mph', m.brake60 != null ? m.brake60 : last.brake60, b.brake60)}`;
  }
  function renderSplits() {
    const r = drv.run && !drv.run.done ? drv.run : drv.last;
    const m = r ? r.m : {}, b = drv.best, live = drv.run && !drv.run.done;
    const cell = (cur, best, fmt) => cur != null ? `<b class="${best != null && Math.abs(cur - best) < 1e-9 ? 'new' : ''}">${fmt(cur)}</b>` : `<b class="pend">${best != null ? fmt(best) : '—'}</b>`;
    const sec = v => v.toFixed(2) + 's';
    const rows = [
      ['0–60 mph', m.s60, b.s60],
      ['0–100 km/h', m.s100k, b.s100k],
      ['0–200 km/h', m.s200k, b.s200k],
      ['100–200 km/h', m.s100k && m.s200k ? m.s200k - m.s100k : null, b.r100_200k],
      ['60–130 mph', m.s60 && m.s130 ? m.s130 - m.s60 : null, b.r60_130],
      ['0–300 km/h', m.s300k, b.s300k],
    ].map(([k, cur, best]) => `<div class="r"><span>${k}</span>${cell(cur, best, sec)}</div>`);
    [['e8', '⅛ mile'], ['q', '¼ mile'], ['half', '½ mile'], ['mile', '1 mile']].forEach(([k, label]) => {
      const cur = m[k], best = b[k];
      rows.push(`<div class="r"><span>${label}</span>${cur ? `<b class="${best && best.t === cur.t ? 'new' : ''}">${cur.t.toFixed(2)}s<small>${drv.kmh ? Math.round(cur.v * 3.6) : Math.round(cur.v / MPS.mph)}</small></b>` : `<b class="pend">${best ? best.t.toFixed(2) + 's' : '—'}</b>`}</div>`);
    });
    rows.push(`<div class="r"><span>Top speed</span><b>${r ? spdTxt(r.vmax) : (b.vmax ? spdTxt(b.vmax) : '—')}</b></div>`);
    $('#dSplits').innerHTML = `<h5><span>${live ? 'Live run' : r ? 'Last run' : 'Splits'}</span><span>${drv.kmh ? 'km/h' : 'mph'}</span></h5>` + rows.join('');
  }
  function renderDriveHUD(dt) {
    const c = state.cfg;
    const stage = $('#driveStage'); stage.classList.toggle('narrow', stage.clientWidth < 820);
    const v = drv.v;
    $('#dSpd').textContent = drv.kmh ? Math.round(v * 3.6) : Math.round(v / MPS.mph);
    $('#dUnit').textContent = drv.kmh ? 'km/h' : 'mph';
    const gearTxt = drv.v < 0.25 && !drv.gas ? 'N' : String(drv.gear + 1);
    Viz.drawTach($('#dTach'), sim.rpm, c.redline, Math.ceil(c.redline * 1.1 / 1000) * 1000, { gear: gearTxt, shiftLight: sim.rpm > c.redline * 0.96, hud: true });
    const lights = 8, lit = Math.round(clamp((sim.rpm - c.redline * 0.7) / (c.redline * 0.27), 0, 1) * lights);
    $('#dShift').innerHTML = Array.from({ length: lights }, (_, i) => `<i class="${i < lit ? (i < 3 ? 'g' : i < 6 ? 'y' : 'r') : ''} ${sim.cut && Math.floor(performance.now() / 80) % 2 ? 'flash' : ''}"></i>`).join('');
    const psi = sim.mode === 'off' ? 0 : boostPsiNow();
    {
      const kmh = drv.v * 3.6, lh = fuelLive.lh;
      const avg = drv.tripM > 50 ? drv.tripL / (drv.tripM / 1000) * 100 : null;
      let inst, frac;
      if (kmh < 4) { inst = `${lh.toFixed(1)} L/h`; frac = clamp(lh / 6, 0, 1); }
      else { const l100 = lh / kmh * 100; inst = fuelTxt(l100); frac = clamp(l100 / 60, 0, 1); }
      $('#dFuelBar').style.width = (frac * 100) + '%';
      $('#dFuelBar').style.background = frac > 0.6 ? '#ff8a3b' : frac > 0.3 ? '#fab219' : '#4cc24c';
      $('#dFuelTxt').textContent = `⛽ ${inst}${avg != null ? ' · avg ' + (drv.kmh || metric() ? avg.toFixed(1) : (235.215 / avg).toFixed(1)) : ''} · ${drv.tripL.toFixed(2)} L`;
    }
    const bt = Math.round(Math.max(drv.brk.T, drv.brk.Tr)), br = drv.bres || {};
    const btCol = br.boil ? '#ff3b3b' : br.fade ? '#ff8a3b' : bt > 450 ? '#fab219' : bt < 120 && c.pads === 'race' ? '#6db3ff' : 'inherit';
    $('#dSub').innerHTML = (state.an.maxBoost > 0.5 ? `Boost ${metric() ? (psi * 0.0689).toFixed(2) + ' bar' : psi.toFixed(1) + ' psi'} · ` : '') +
      `${drv.auto ? 'Auto' : 'Manual'} · <span style="color:${btCol}">Brakes ${bt}°C</span>${drv.spin ? ' · WHEELSPIN' : ''}`;
    const r = drv.run;
    $('#dTimer').textContent = r ? r.t.toFixed(3) : '0.000';
    $('#dDist').textContent = r ? distTxt(drv.x - r.x0) : distTxt(0);
    drv.msgT -= dt;
    let msg = drv.msgT > 0 ? drv.msg : '';
    const brs = drv.bres || {};
    if (!msg && drv.v > 1 && drv.bp > 0.3) {
      if (brs.boil) msg = 'BRAKE FLUID BOILING — pedal to the floor!';
      else if (brs.lockF || brs.lockR) msg = `WHEELS LOCKED${brs.lockR && !brs.lockF ? ' (rears — move bias forward)' : ''} — ease off!`;
      else if (brs.fade) msg = 'BRAKE FADE — pads overheating';
      else if (brs.cold) msg = 'Race pads are cold — weak bite';
    }
    if (!msg) {
      if (sim.mode === 'off') msg = 'Press GAS (or Enter) to start the engine';
      else if (sim.mode === 'blown') msg = 'Engine blown — rebuild it';
      else if (drv.v < 0.25 && drv.brake && drv.gas) msg = `LAUNCH CONTROL · ${Math.round(c.launchRpm).toLocaleString()} rpm — release BRAKE!`;
      else if (drv.v < 0.25 && drv.brake) msg = 'On the brake — add GAS to arm launch control';
      else if (drv.v < 0.25) msg = 'Hold BRAKE + GAS, then release BRAKE to launch';
    }
    $('#dMsg').textContent = msg;
    $('#dMsg').classList.toggle('hot', /LAUNCH|GO!|RED|BOIL|LOCK|FADE|CHUTE/.test(msg));
    boardT -= dt;
    if (boardT <= 0) { boardT = 0.12; renderDriveBoard(); renderSplits(); renderBrakePanel(); }
  }

  /* ---------------- inputs ---------------- */
  const pedal = $('#pedal');
  const pedalOn = (e) => { e.preventDefault(); ensureAudio(); sim.pedal = true; pedal.classList.add('down'); if (e.pointerId != null) try { pedal.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } };
  const pedalOff = () => { sim.pedal = false; pedal.classList.remove('down'); };
  pedal.addEventListener('pointerdown', pedalOn);
  pedal.addEventListener('pointerup', pedalOff);
  pedal.addEventListener('pointercancel', pedalOff);
  pedal.addEventListener('lostpointercapture', pedalOff);
  $('#thrFix').addEventListener('input', e => { sim.fixThr = e.target.value / 100; $('#thrVal').textContent = e.target.value + '%'; });
  function syncThrUI() { $('#thrFix').value = Math.round(sim.fixThr * 100); $('#thrVal').textContent = Math.round(sim.fixThr * 100) + '%'; }
  state.volume = LS.get('ts.vol', 0.7);
  $('#vol').value = Math.round(state.volume * 100); $('#volVal').textContent = Math.round(state.volume * 100) + '%';
  $('#vol').addEventListener('input', e => { state.volume = e.target.value / 100; $('#volVal').textContent = e.target.value + '%'; LS.set('ts.vol', state.volume); });
  $('#micSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.mic = b.dataset.m; $$('#micSeg button').forEach(x => x.classList.toggle('on', x === b)); });

  const typing = (el) => el && (el.tagName === 'INPUT' && el.type !== 'range' && el.type !== 'checkbox' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  document.addEventListener('keydown', e => {
    if (typing(document.activeElement) || e.metaKey || e.altKey) return;
    if (state.view === 'drive') {
      if (e.key.toLowerCase() === 'w' || e.key === 'ArrowUp') { ensureAudio(); if (sim.mode === 'off' && !e.repeat) startEngine(); else if (sim.mode === 'blown' && !e.repeat) $('#blown').hidden = false; }
      if (driveKey(e, true)) { e.preventDefault(); return; }
    }
    if (e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'w' || k === 'arrowup') { e.preventDefault(); if (!sim.pedal) { ensureAudio(); sim.pedal = true; pedal.classList.add('down'); } }
    else if (k === 's' && !e.repeat) { ensureAudio(); toggleEngine(); }
    else if (k === 'd' && !e.repeat) { ensureAudio(); startDyno({}); }
    else if (k === 'r' && !e.repeat) { ensureAudio(); runDrag({}); }
  });
  document.addEventListener('keyup', e => {
    if (state.view === 'drive' && driveKey(e, false)) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'w' || k === 'arrowup') pedalOff();
  });
  window.addEventListener('blur', () => { pedalOff(); drv.gas = false; drv.brake = false; });

  /* ---------------- toast ---------------- */
  let toastT = null;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------------- render loop ---------------- */
  let lastT = performance.now(), evCache = null, evKey = '';
  let readT = 0, chartT = 0;
  function frame(now) {
    let dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    // sub-step for stability
    const n = Math.ceil(dt / 0.004);
    for (let i = 0; i < n; i++) tick(dt / n);
    if (state.an) {
      const live = sim.mode === 'run' || sim.mode === 'dyno' || sim.mode === 'drag';
      const kgs = live ? fuelKgS(sim.rpm, sim.torque, sim.thr, sim.cut) : 0;
      fuelLive.kgs += (kgs - fuelLive.kgs) * Math.min(1, dt / 0.35);   // like a real trip computer, lightly smoothed
      fuelLive.lh = kgsToLh(fuelLive.kgs);
      if (state.view === 'drive') { drv.tripL += kgsToLh(kgs) / 3600 * dt; drv.tripM += drv.v * dt; }
    }
    sendAudio();
    const c = state.cfg, an = state.an;
    if (an) {
      const key = JSON.stringify([c.layout, c.cyl, c.vAngle, c.crank, c.headers]);
      if (key !== evKey) { evKey = key; evCache = soundConfigFor(c, an).events; }
      Viz.drawEngine($('#engineCv'), c, evCache, sim.theta, { running: sim.mode === 'run' || sim.mode === 'dyno' || sim.mode === 'drag', cut: sim.cut });
      const maxR = Math.ceil(c.redline * 1.1 / 1000) * 1000;
      Viz.drawTach($('#tachCv'), sim.rpm, c.redline, maxR, { gear: sim.mode === 'drag' && sim.drag && sim.drag.phase === 'run' ? String(sim.drag.gear) : null, shiftLight: sim.rpm > c.redline * 0.96 });
      const psi = sim.mode === 'off' || sim.mode === 'blown' ? 0 : boostPsiNow();
      Viz.drawBoost($('#boostCv'), psi, an.maxBoost, false);
      readT -= dt;
      if (readT <= 0) {
        readT = 0.1;
        $('#slowmo').textContent = sim.rpm > 30 ? `slow-mo 1/${Math.round(sim.slow)}×` : '';
        $('#boostRead').textContent = sim.mode === 'off' || sim.mode === 'blown' ? '—' : metric() ? (psi * 0.0689).toFixed(2) + ' bar' : (Math.abs(psi) < 0.05 ? '0.0' : (psi > 0 ? '+' : '') + psi.toFixed(1)) + ' psi';
        const w = sim.torque * sim.rpm / 60 * 2 * Math.PI;
        $('#rdP').textContent = `${fmtP(w)} ${state.unitP}`;
        $('#rdT').textContent = `${fmtT(sim.torque)} ${TL[state.unitT]}`;
        $('#rdL').textContent = `${Math.round(clamp(sim.load, 0, 1) * 100)}%`;
        const live = sim.mode === 'run' || sim.mode === 'dyno' || sim.mode === 'drag';
        const pt = an.pts[Math.min(an.pts.length - 1, Math.max(0, Math.round((sim.rpm - 1000) / an.step)))];
        $('#rdA').textContent = live ? (sim.load > 0.6 ? (pt.lambda * E.FUELS[c.fuel].stoich).toFixed(1) : (E.FUELS[c.fuel].stoich * (sim.cut ? 1.6 : 1)).toFixed(1)) : '—';
        $('#rdE').textContent = live ? Math.round(320 + (pt.egt - 320) * Math.sqrt(clamp(sim.load, 0, 1)) * Math.min(1, sim.rpm / 2500 + 0.3)) + '°C' : '—';
        $('#rdR').textContent = live && sim.load > 0.6 ? pt.retard.toFixed(1) + '°' : live ? '0.0°' : '—';
        const kW = sim.torque * sim.rpm / 60 * 2 * Math.PI / 1000;
        $('#rdF').textContent = live ? `${fuelLive.lh.toFixed(1)} L/h` : '—';
        $('#rdB').textContent = live && kW > 2 ? `${Math.round(fuelLive.kgs * 1000 * 3600 / kW)} g/kWh` : '—';
        $('#rdI').textContent = live ? `${Math.round(clamp(fuelLive.lh / (c.injector * (isR(c) ? c.cyl * 2 : c.cyl) * 60 / 1000), 0, 9.99) * 100)}%` : '—';
      }
      if (state.view === 'drive' && drv.inited && drv.S) {
        Drive3D.render({ x: drv.x, v: drv.v, wheelV: drv.wheelV, brake: drv.brake, spin: drv.spin, acc: drv.acc, rpm: sim.rpm, dt,
          flame: drv.flame > 0 || (sim.cut && c.pops !== 'off' && Math.random() < 0.3), tree: drv.tree, drive: c.drivetrain,
          lockF: drv.bres && drv.bres.lockF, lockR: drv.bres && drv.bres.lockR, brakeT: drv.brk.T, brakeTR: drv.brk.Tr, chute: drv.chute, chuteFit: c.chute });
        renderDriveHUD(dt);
      }
      if (sim.mode === 'dyno' && state.view === 'dyno') { chartT -= dt; if (chartT <= 0) { chartT = 1 / 30; renderCharts(); } }
      if (sim.drag && state.view === 'drag') {
        const d = sim.drag;
        Viz.drawStrip($('#stripCv'), d.phase === 'stage' ? { x: 0, v: 0, spin: sim.cut && Math.random() < 0.3 } : d.me, d.phase === 'stage' ? { x: 0, v: 0 } : d.rv, d.phase === 'stage' || (d.phase === 'run' && d.rt < 1) ? { stage: d.phase === 'stage' ? d.tree.stage : 4 } : null, { rivalName: d.rname, finish: d.dist });
        const v = d.me.v || 0;
        $('#hudSpd').textContent = metric() ? Math.round(v * 3.6) + ' km/h' : Math.round(v * 2.23694) + ' mph';
        $('#hudGear').textContent = d.phase === 'stage' ? 'N' : String(d.me.gear || d.gear);
        $('#hudTime').textContent = d.phase === 'stage' ? '0.000' : (d.res.marks.fin && (d.rt >= d.res.marks.fin || (d.me.x || 0) >= d.dist) ? d.res.marks.fin : d.rt).toFixed(3);
        $('#hudDist').textContent = metric() ? Math.round(Math.min(d.me.x || 0, d.dist)) + ' m' : Math.round(Math.min(d.me.x || 0, d.dist) * 3.28084) + ' ft';
        if (c.mguk) { $('#hudXLabel').textContent = 'Battery'; const f = d.phase === 'run' ? frameAt(d.res.frames, d.rt) : null; $('#hudX').textContent = f ? Math.round(f.batt / (c.battery * 10)) + '%' : '100%'; }
        else { $('#hudXLabel').textContent = 'Boost'; $('#hudX').textContent = an.maxBoost > 0.5 ? (metric() ? (psi * 0.0689).toFixed(2) + ' bar' : psi.toFixed(1) + ' psi') : 'N/A'; }
      } else if (state.view === 'drag' && !sim.drag) {
        Viz.drawStrip($('#stripCv'), { x: 0, v: 0 }, { x: 0, v: 0 }, { stage: 0 }, { rivalName: 'Rival' });
      }
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', () => { Charts.redrawAll(); if (drv.inited) Drive3D.resize(); });

  /* ---------------- boot ---------------- */
  chP = Charts.create($('#chPower'));
  chT = Charts.create($('#chTorque'));
  chA = Charts.create($('#chAux'));
  renderTabs(); renderPresetSel(); renderParts(); syncUnitBtns(); renderRivals();
  update();
  $('#btnEnter').addEventListener('click', async () => {
    $('#splash').hidden = true;
    await ensureAudio();
    startEngine();
  });
  $('#rivalSel').addEventListener('change', () => {});
  requestAnimationFrame(frame);
  window.__ts = { state, sim, drv, fuelLive, cruise: (k) => cruiseLper100(k), dbg: { finishEvent: (id, r) => finishEvent(CR.EVENTS.find(e => e.id === id), r), blow } };
})();
