/* =====================================================================
   TORQUESMITH — 3D test track (Three.js)
   The car stays at the origin facing -Z; the world scrolls past it, so
   the strip is effectively endless with no floating-point drift.
   ===================================================================== */
const Drive3D = (function () {
  'use strict';
  let ok = false, renderer, scene, camera, container;
  let car, body, wheelGroups = [], tailMats = [], flame, flameMat, blob, rotorMat, rotorMatR, chute, chutePack;
  let roadTex, grassTex, wallTex, roadMesh, grassMesh;
  const poles = [], boards = [], lines = [], smoke = [];
  let tree, treeLights = [];
  let camMode = 0, trackCamD = 120, shake = 0;
  let carColor = '#3987e5';
  const TILE = 20;          // metres per road texture tile
  const MI = 1609.344;
  const BOARDS = [[18.288, '60 FT'], [100.584, '330 FT'], [MI / 8, '1/8 MILE'], [304.8, '1000 FT'], [MI / 4, '1/4 MILE'], [MI / 2, '1/2 MILE'], [MI, '1 MILE'], [2 * MI, '2 MILES'], [3 * MI, '3 MILES'], [5 * MI, '5 MILES']];
  const FINISH = [MI / 8, MI / 4, MI / 2, MI];

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  function noise(g, w, h, base, amp, n) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const v = Math.random() * amp - amp / 2;
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }

  function buildWorld() {
    // sky gradient + fog
    const sky = canvasTex(4, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#2a4f86'); gr.addColorStop(0.55, '#8fb3d9'); gr.addColorStop(0.75, '#e9d7b8'); gr.addColorStop(1, '#d9c7a8');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    scene.background = sky;
    scene.fog = new THREE.Fog(0xcdbfa6, 250, 1500);
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x6b5a3a, 0.75));
    const sun = new THREE.DirectionalLight(0xfff1dc, 0.9); sun.position.set(-40, 80, 30); scene.add(sun);

    // distant mountains (a big cylinder that never moves)
    const mt = canvasTex(2048, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      for (let layer = 0; layer < 2; layer++) {
        g.fillStyle = layer ? 'rgba(120,112,120,0.9)' : 'rgba(150,140,148,0.7)';
        g.beginPath(); g.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) {
          const y = h * (0.45 + layer * 0.15) - Math.abs(Math.sin(x * 0.004 + layer * 2) * 60 + Math.sin(x * 0.013 + layer) * 25 + Math.sin(x * 0.041) * 8);
          g.lineTo(x, y);
        }
        g.lineTo(w, h); g.closePath(); g.fill();
      }
    });
    mt.wrapS = THREE.RepeatWrapping;
    const mtn = new THREE.Mesh(new THREE.CylinderGeometry(1700, 1700, 260, 64, 1, true), new THREE.MeshBasicMaterial({ map: mt, transparent: true, side: THREE.BackSide, fog: false }));
    mtn.position.y = 100; scene.add(mtn);

    // ground
    grassTex = canvasTex(256, 256, (g, w, h) => noise(g, w, h, '#8a7a55', 0.18, 5000), true);
    grassTex.repeat.set(60, 60);
    grassMesh = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ map: grassTex }));
    grassMesh.rotation.x = -Math.PI / 2; grassMesh.position.y = -0.02; scene.add(grassMesh);

    // road: asphalt, edge lines, centre line, rubber in the launch groove
    roadTex = canvasTex(512, 1024, (g, w, h) => {
      noise(g, w, h, '#3b3b3d', 0.22, 26000);
      // rubber laid down in each lane
      [[0.27, 0.12], [0.73, 0.12]].forEach(([cx, ww]) => {
        const gr = g.createLinearGradient(w * (cx - ww), 0, w * (cx + ww), 0);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.3, 'rgba(10,10,10,0.35)'); gr.addColorStop(0.5, 'rgba(10,10,10,0.15)'); gr.addColorStop(0.7, 'rgba(10,10,10,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(w * (cx - ww), 0, w * ww * 2, h);
      });
      g.fillStyle = '#f2f0e8'; g.fillRect(10, 0, 9, h); g.fillRect(w - 19, 0, 9, h);
      g.fillStyle = '#f0c419'; g.fillRect(w / 2 - 5, 0, 10, h * 0.55);
    }, true);
    roadTex.repeat.set(1, 1400 / TILE);
    roadMesh = new THREE.Mesh(new THREE.PlaneGeometry(18, 1400), new THREE.MeshLambertMaterial({ map: roadTex }));
    roadMesh.rotation.x = -Math.PI / 2; roadMesh.position.set(0, 0, -600); scene.add(roadMesh);

    // concrete walls with seams
    wallTex = canvasTex(256, 64, (g, w, h) => {
      noise(g, w, h, '#b9b4a8', 0.15, 3000);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 3, h);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, h - 10, w, 10);
    }, true);
    wallTex.repeat.set(1400 / 4, 1);
    [-1, 1].forEach(side => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1.0), new THREE.MeshLambertMaterial({ map: wallTex, side: THREE.DoubleSide }));
      m.rotation.y = Math.PI / 2; m.position.set(side * 10.5, 0.5, -600);
      m.userData.side = side; scene.add(m); lines.push({ wall: m });
    });

    // light poles (recycled)
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x8a8d92 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8 });
    for (let i = 0; i < 48; i++) {
      const gp = new THREE.Group();
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 11, 6), poleMat); p.position.y = 5.5; gp.add(p);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), poleMat); arm.position.set(0, 10.9, 0); gp.add(arm);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.4), lampMat); lamp.position.set(0, 10.8, 0); gp.add(lamp);
      gp.userData = { side: i % 2 ? 1 : -1, k: Math.floor(i / 2) };
      arm.position.x = -gp.userData.side * 1.1; lamp.position.x = -gp.userData.side * 2.0;
      scene.add(gp); poles.push(gp);
    }

    // distance boards (both sides) and finish stripes
    BOARDS.forEach(([d, label]) => {
      const tex = canvasTex(512, 160, (g, w, h) => {
        g.fillStyle = '#111'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#f0c419'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
        g.fillStyle = '#fff'; g.font = 'bold 92px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(label, w / 2, h / 2 + 4);
      });
      const gp = new THREE.Group();
      [-1, 1].forEach(side => {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.3), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
        sign.position.set(side * 12.5, 3.2, 0); gp.add(sign);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3, 0.15), poleMat); post.position.set(side * 12.5, 1.3, 0); gp.add(post);
      });
      gp.userData.d = d; scene.add(gp); boards.push(gp);
    });
    const checker = canvasTex(256, 32, (g, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; g.fillRect(i * 16, j * 16, 16, 16); } });
    [0].concat(FINISH).forEach(d => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(18, d ? 1.2 : 0.5), new THREE.MeshBasicMaterial({ map: d ? checker : null, color: d ? 0xffffff : 0xf2f0e8 }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.userData.d = d; scene.add(m); boards.push(m);
    });

    // grandstands near the start
    const standMat = new THREE.MeshLambertMaterial({ color: 0x5a5f6a });
    const crowdTex = canvasTex(512, 128, (g, w, h) => {
      g.fillStyle = '#3c414b'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) { g.fillStyle = `hsl(${Math.random() * 360},45%,${35 + Math.random() * 35}%)`; g.fillRect(Math.random() * w, Math.random() * h, 3, 5); }
    });
    [[-1, -30], [-1, 60], [1, 20], [1, 110]].forEach(([side, d]) => {
      const gp = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(5, 0.8, 70), k === 5 ? standMat : new THREE.MeshLambertMaterial({ map: crowdTex }));
        step.position.set(side * (17 + k * 2.2), 0.4 + k * 0.8, 0); gp.add(step);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(16, 0.3, 72), standMat); roof.position.set(side * 22.5, 8, 0); gp.add(roof);
      gp.userData.d = d; scene.add(gp); boards.push(gp);
    });

    // christmas tree at the start line
    tree = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.2, 0.3), new THREE.MeshLambertMaterial({ color: 0x1b1b1b }));
    housing.position.y = 2.6; tree.add(housing);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6), poleMat); post.position.y = 0.6; tree.add(post);
    const cols = [0xfab219, 0xfab219, 0xfab219, 0x19d219, 0xd03b3b];
    cols.forEach((c, i) => {
      const m = new THREE.MeshBasicMaterial({ color: 0x222222 });
      m.userData.on = c;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), m); b.position.set(0, 3.8 - i * 0.55, 0.17); tree.add(b); treeLights.push(m);
    });
    tree.position.set(0, 0, 0); tree.userData.d = 9; scene.add(tree); boards.push(tree);
  }

  function buildCar() {
    car = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: carColor, metalness: 0.55, roughness: 0.32 });
    // side profile extruded across the width; nose at +x (becomes -z after rotation)
    const sh = new THREE.Shape();
    const P = [[-2.25, 0.32], [-2.27, 0.92], [-1.95, 1.0], [-1.05, 1.04], [-0.55, 1.36], [0.4, 1.4], [1.05, 1.02], [2.05, 0.84], [2.3, 0.6], [2.28, 0.32]];
    sh.moveTo(P[0][0], P[0][1]); P.slice(1).forEach(p => sh.lineTo(p[0], p[1])); sh.closePath();
    const bg = new THREE.ExtrudeGeometry(sh, { depth: 1.78, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
    bg.translate(0, 0, -0.89);
    body = new THREE.Mesh(bg, paint); body.rotation.y = Math.PI / 2; car.add(body);
    const gs = new THREE.Shape();
    const Gp = [[-1.0, 1.05], [-0.55, 1.32], [0.38, 1.35], [1.0, 1.04]];
    gs.moveTo(Gp[0][0], Gp[0][1]); Gp.slice(1).forEach(p => gs.lineTo(p[0], p[1])); gs.closePath();
    const gg = new THREE.ExtrudeGeometry(gs, { depth: 1.84, bevelEnabled: false }); gg.translate(0, 0, -0.92);
    const glass = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: 0x0d1117, metalness: 0.9, roughness: 0.1 }));
    glass.rotation.y = Math.PI / 2; car.add(glass);
    // rear wing
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.38), paint); wing.position.set(0, 1.2, 2.05); car.add(wing);
    [-0.7, 0.7].forEach(x => { const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.2), paint); s.position.set(x, 1.05, 2.05); car.add(s); });
    // lights
    [-0.68, 0.68].forEach(x => {
      const tm = new THREE.MeshBasicMaterial({ color: 0x550000 }); tailMats.push(tm);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.05), tm); tl.position.set(x, 0.8, 2.33); car.add(tl);
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xfff6dc })); hl.position.set(x, 0.62, -2.35); car.add(hl);
    });
    // exhaust tips + flame
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 1, roughness: 0.3 });
    [-0.45, 0.45].forEach(x => { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 10), tipMat); t.rotation.x = Math.PI / 2; t.position.set(x, 0.35, 2.33); car.add(t); });
    flameMat = new THREE.MeshBasicMaterial({ color: 0xff9a2e, transparent: true, opacity: 0.9 });
    flame = new THREE.Group();
    [-0.45, 0.45].forEach(x => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.7, 8), flameMat); f.rotation.x = -Math.PI / 2; f.position.set(x, 0.35, 2.75); flame.add(f); });
    flame.visible = false; car.add(flame);
    // wheels
    const tire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const rim = new THREE.MeshStandardMaterial({ color: 0xc9c9c9, metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide });
    rotorMat = new THREE.MeshBasicMaterial({ color: 0x3a3a3a });
    rotorMatR = new THREE.MeshBasicMaterial({ color: 0x3a3a3a });
    const caliperMat = new THREE.MeshStandardMaterial({ color: 0xd03b3b, metalness: 0.3, roughness: 0.5 });
    [[-0.86, -1.42, 0], [0.86, -1.42, 0], [-0.86, 1.38, 1], [0.86, 1.38, 1]].forEach(([x, z, rear]) => {
      const sx = Math.sign(x);
      const g = new THREE.Group(); g.position.set(x, 0.34, z);
      const spin = new THREE.Group(); g.add(spin);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 24, 1, true), tire); t.rotation.z = Math.PI / 2; spin.add(t);
      const wall = new THREE.Mesh(new THREE.RingGeometry(0.235, 0.34, 24), tire); wall.rotation.y = sx * Math.PI / 2; wall.position.x = sx * 0.15; spin.add(wall);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.28, 24, 1, true), rim); barrel.rotation.z = Math.PI / 2; spin.add(barrel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), rim); hub.rotation.z = Math.PI / 2; hub.position.x = sx * 0.13; spin.add(hub);
      for (let k = 0; k < 5; k++) { const holder = new THREE.Group(); holder.rotation.x = k * Math.PI * 2 / 5; const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.05), rim); s2.position.x = sx * 0.13; holder.add(s2); spin.add(holder); }
      // brake rotor (spins) and caliper (fixed, clamps the top-rear of the rotor)
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.035, 28), rear ? rotorMatR : rotorMat); rotor.rotation.z = Math.PI / 2; rotor.position.x = sx * 0.02; spin.add(rotor);
      const cal = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.2), caliperMat); cal.position.set(sx * 0.07, 0.13, rear ? -0.08 : 0.08); g.add(cal);
      g.userData = { spin, rear }; car.add(g); wheelGroups.push(g);
    });
    // drag parachute (packed on the rear, deploys behind the car)
    chutePack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 }));
    chutePack.position.set(0, 0.85, 2.38); chutePack.visible = false; car.add(chutePack);
    chute = new THREE.Group();
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.9, side: THREE.DoubleSide });
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), canopyMat);
    canopy.rotation.x = -Math.PI / 2; canopy.position.z = 6; chute.add(canopy);
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.52, 16, 4, 0, Math.PI * 2, Math.PI / 4, 0.25), new THREE.MeshStandardMaterial({ color: 0xd03b3b, side: THREE.DoubleSide }));
    stripe.rotation.x = -Math.PI / 2; stripe.position.z = 6; chute.add(stripe);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xdddddd });
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 1.4, Math.sin(a) * 1.4, 6)]);
      chute.add(new THREE.Line(geo, lineMat));
    }
    chute.position.set(0, 0.9, 2.4); chute.visible = false; car.add(chute);
    // contact shadow
    const sh2 = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 5, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,0.65)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    blob = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 5.6), new THREE.MeshBasicMaterial({ map: sh2, transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; car.add(blob);
    scene.add(car);
    // tyre smoke sprites
    const smokeTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(235,235,235,0.9)'); gr.addColorStop(1, 'rgba(235,235,235,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    for (let i = 0; i < 70; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false; s.userData = { life: 0 }; scene.add(s); smoke.push(s);
    }
  }

  function init(el) {
    if (ok) { if (el && renderer.domElement.parentNode !== el) el.appendChild(renderer.domElement); container = el; resize(); return true; }
    if (typeof THREE === 'undefined') return false;
    container = el;
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    el.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(62, 1, 0.1, 4000);
    buildWorld(); buildCar();
    ok = true; resize();
    return true;
  }
  function resize() {
    if (!ok || !container) return;
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function setColor(hex) {
    carColor = hex;
    if (ok) body.material.color.set(hex);
  }
  function cycleCam() { camMode = (camMode + 1) % 3; return ['Chase cam', 'Hood cam', 'Trackside cam'][camMode]; }

  let lastX = 0, lastT = 0;
  // s: { x, v, wheelV, brake, spin, flame, tree (0..5), dt, drive:'FWD'|'RWD'|'AWD' }
  function render(s) {
    if (!ok) return;
    const dt = s.dt || 1 / 60;
    const x = s.x;
    // scrolling surfaces
    roadTex.offset.y = (x / TILE) % 1;
    grassTex.offset.y = (x / (4000 / 60)) % 1;
    wallTex.offset.x = (x / 4) % 1;
    // recycled light poles every 40 m
    const span = 24 * 40;
    poles.forEach(p => {
      const d0 = p.userData.k * 40;
      const d = x - 120 + ((((d0 - (x - 120)) % span) + span) % span);
      p.position.set(p.userData.side * 11.5, 0, -(d - x));
    });
    // fixed-distance objects
    boards.forEach(b => {
      const z = -(b.userData.d - x);
      b.visible = z < 120 && z > -1600;
      b.position.z = z;
    });
    tree.position.x = -9.6;
    treeLights.forEach((m, i) => {
      const on = s.tree === 'red' ? i === 4 : (i < 3 && s.tree >= i + 1) || (i === 3 && s.tree >= 4);
      m.color.setHex(on ? m.userData.on : 0x222222);
    });
    // car
    const wr = 0.34;
    wheelGroups.forEach(w => {
      const driven = s.drive === 'AWD' || (s.drive === 'RWD' ? w.userData.rear : !w.userData.rear);
      const locked = w.userData.rear ? s.lockR : s.lockF;
      const sp = locked ? 0 : driven ? s.wheelV : s.v;
      w.userData.spin.rotation.x -= sp / wr * dt;
    });
    // brake rotors glow as they heat: dull red from ~350 °C to yellow-orange near 900 °C
    const glow = (mat, T) => {
      const k = Math.max(0, Math.min(1, ((T || 30) - 330) / 600));
      if (k <= 0) mat.color.setHex(0x3a3a3a);
      else mat.color.setRGB(0.23 + 0.77 * Math.min(1, k * 1.6), 0.05 + 0.55 * k * k, 0.03 + 0.25 * k * k * k);
    };
    glow(rotorMat, s.brakeT); glow(rotorMatR, s.brakeTR == null ? s.brakeT : s.brakeTR);
    // parachute
    chutePack.visible = !!s.chuteFit && !s.chute;
    chute.visible = !!s.chute;
    if (s.chute) {
      chute.userData.open = Math.min(1, (chute.userData.open || 0) + dt * 2.5);
      const o = chute.userData.open;
      chute.scale.set(o, o, 0.4 + 0.6 * o);
      chute.rotation.x = 0.04 + Math.sin(performance.now() * 0.006) * 0.025; chute.rotation.y = Math.sin(performance.now() * 0.0045) * 0.04;
    } else chute.userData.open = 0;
    tailMats.forEach(m => m.color.setHex(s.brake ? 0xff2020 : 0x550000));
    // squat under acceleration, dive under braking
    const acc = s.acc || 0;
    car.rotation.x = THREE.MathUtils.lerp(car.rotation.x, Math.max(-0.035, Math.min(0.03, acc * 0.0022)), 0.15);
    car.position.y = Math.sin(performance.now() * 0.05) * 0.004 * (s.rpm > 0 ? 1 : 0);
    flame.visible = !!s.flame;
    if (s.flame) flame.scale.set(1, 1, 0.6 + Math.random() * 0.9);
    // smoke
    const emit = (s.spin ? 3 : 0) + (s.lockF || s.lockR ? 2 : 0);
    for (let k = 0; k < emit; k++) {
      const p = smoke.find(q => !q.visible); if (!p) break;
      const fromLock = (s.lockF || s.lockR) && (!s.spin || k >= 3);
      const rearSide = fromLock ? (s.lockR ? 1.38 : -1.42) : (s.drive === 'FWD' ? -1.42 : 1.38);
      p.visible = true; p.userData.life = 1;
      p.position.set((Math.random() < 0.5 ? -0.86 : 0.86) + (Math.random() - 0.5) * 0.3, 0.3, rearSide + 0.2);
      p.userData.vx = (Math.random() - 0.5) * 1.5; p.userData.vy = 0.6 + Math.random() * 0.8;
      p.scale.setScalar(0.8);
    }
    smoke.forEach(p => {
      if (!p.visible) return;
      p.userData.life -= dt * 0.55;
      if (p.userData.life <= 0) { p.visible = false; p.material.opacity = 0; return; }
      p.position.z += (s.v + 1.5) * dt; p.position.x += p.userData.vx * dt; p.position.y += p.userData.vy * dt;
      p.scale.multiplyScalar(1 + dt * 1.6);
      p.material.opacity = 0.55 * p.userData.life;
    });
    // camera
    shake = Math.max(0, shake - dt * 2) + (s.spin ? 0.02 : 0);
    const sp = s.v;
    const jit = (Math.random() - 0.5) * (Math.min(1, sp / 90) * 0.035 + shake * 0.15);
    if (camMode === 0) {
      camera.fov = 60 + Math.min(22, sp * 0.16);
      const co = chute.userData.open || 0;   // pull back to show the parachute
      const back = 7.4 + Math.min(1.5, Math.max(-0.5, acc * 0.08)) + co * 9;
      camera.position.set(jit + co * 6, 2.55 + jit + co * 2.2, back);
      camera.lookAt(0, -0.25 - co * 1.6, -6 + co * 9);
    } else if (camMode === 1) {
      camera.fov = 70 + Math.min(18, sp * 0.13);
      camera.position.set(jit * 0.5, 1.3 + jit * 0.5, -0.4);
      camera.lookAt(0, 1.1, -40);
    } else {
      if (sp < 5) trackCamD = x + 7;
      else if (x > trackCamD + 30 || x < trackCamD - 250) trackCamD = x + 140 + sp * 1.5;
      camera.fov = 40;
      camera.position.set(-14, 2.4, -(trackCamD - x));
      camera.lookAt(0, 0.8, 0);
    }
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    lastX = x;
  }
  function kick(a) { shake = Math.min(1, shake + a); }
  return { init, render, resize, setColor, cycleCam, kick, get ok() { return ok; } };
})();
