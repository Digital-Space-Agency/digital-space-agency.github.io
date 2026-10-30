import * as THREE from 'three';

const host = document.getElementById('space');
const list = document.getElementById('moons');
const panel = document.getElementById('panel');
const tip = document.getElementById('tip');
const loader = document.getElementById('loader');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const BRAND = { pri: '#260780', sec: '#ff706f', dark: '#191832' };
const TEX = '/assets/tex/';

function webgl() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

function boot() {
  if (!host || !webgl()) { document.documentElement.classList.add('no-webgl'); loader && loader.remove(); return; }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
  camera.position.set(0, 0.6, 10.5);
  camera.lookAt(0, 0, 0);

  const world = new THREE.Group();
  world.rotation.x = 0.28;
  scene.add(world);

  // ---- lighting (sun fixed in world space) ----
  const sunDir = new THREE.Vector3(-2.6, 1.0, 4.2).normalize();
  const sun = new THREE.DirectionalLight(0xfff1e0, 3.2);
  sun.position.copy(sunDir).multiplyScalar(20);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x7a6cff, 0x1a0f40, 0.7));

  // ---- textures ----
  const mgr = new THREE.LoadingManager();
  const tl = new THREE.TextureLoader(mgr);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const load = (f, srgb) => {
    const t = tl.load(TEX + f);
    t.anisotropy = maxAniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const dayMap = load('earth_atmos_2048.jpg', true);
  const specMap = load('earth_specular_2048.jpg');
  const normMap = load('earth_normal_2048.jpg');
  const cloudMap = load('earth_clouds_1024.png', true);
  const lightMap = load('earth_lights_2048.png', true);

  // ---- planet ----
  const planet = new THREE.Group();
  planet.rotation.z = THREE.MathUtils.degToRad(-12);
  world.add(planet);

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 128, 96),
    new THREE.MeshStandardMaterial({
      map: dayMap, normalMap: normMap, normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: specMap, roughness: 0.9, metalness: 0.05,
    })
  );
  // make oceans glossier, land rougher
  earth.material.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `float roughnessFactor = roughness;
       #ifdef USE_ROUGHNESSMAP
         vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
         roughnessFactor *= mix(1.0, 0.18, texelRoughness.g);
       #endif`
    );
  };
  planet.add(earth);

  const nightMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: lightMap }, sunDir: { value: sunDir } },
    vertexShader: `varying vec2 vUv; varying vec3 vN;
      void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `uniform sampler2D map; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN;
      void main(){ float d=dot(normalize(vN),sunDir); float k=smoothstep(0.08,-0.22,d);
        vec3 c=texture2D(map,vUv).rgb*vec3(1.0,0.72,0.45)*k*2.2; gl_FragColor=vec4(c,1.0);} `,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  planet.add(new THREE.Mesh(new THREE.SphereGeometry(1.002, 96, 64), nightMat));

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.012, 96, 64),
    new THREE.MeshStandardMaterial({ map: cloudMap, transparent: true, opacity: 0.85, depthWrite: false, roughness: 1 })
  );
  planet.add(clouds);

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(1.14, 96, 64),
    new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(normalMatrix*normal); vW=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);} `,
      fragmentShader: `varying vec3 vN; varying vec3 vW; uniform vec3 sunDir;
        void main(){ float f=pow(0.74-dot(vN,vec3(0.,0.,1.)),3.2);
          float lit=smoothstep(-0.5,0.7,dot(normalize(vW),sunDir));
          vec3 col=mix(vec3(0.38,0.30,1.0),vec3(1.0,0.44,0.43),0.22+0.3*(1.-lit));
          gl_FragColor=vec4(col,1.)*f*(0.35+0.9*lit); } `,
      uniforms: { sunDir: { value: sunDir } },
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    })
  );
  world.add(atmo);

  // ---- stars ----
  const N = 3200;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 60 + Math.random() * 120, a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1);
    pos.set([r * Math.sin(b) * Math.cos(a), r * Math.cos(b), r * Math.sin(b) * Math.sin(a)], i * 3);
    const t = Math.random(), c = new THREE.Color().setHSL(t < 0.2 ? 0.02 : 0.68, 0.5, 0.65 + Math.random() * 0.3);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false }));
  scene.add(stars);

  // ---- badge textures ----
  const imgCache = {};
  const loadImg = (src) => imgCache[src] || (imgCache[src] = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }));

  function wrap(ctx, text, maxW) {
    const words = text.split(' '), lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line); return lines;
  }
  async function badge({ name, icon, kind }) {
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'), R = S / 2 - 22;
    x.translate(S / 2, S / 2);
    // glow
    const g = x.createRadialGradient(0, 0, R * 0.7, 0, 0, S / 2);
    g.addColorStop(0, 'rgba(255,112,111,.55)'); g.addColorStop(1, 'rgba(255,112,111,0)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, S / 2, 0, 7); x.fill();
    // body
    x.save(); x.beginPath(); x.arc(0, 0, R, 0, 7); x.clip();
    const bg = x.createLinearGradient(-R, -R, R, R);
    bg.addColorStop(0, '#3a1aa8'); bg.addColorStop(1, '#12092f');
    x.fillStyle = bg; x.fillRect(-R, -R, R * 2, R * 2);
    const img = icon ? await loadImg(icon) : null;
    if (img) { x.drawImage(img, -R, -R, R * 2, R * 2); }
    else {
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      let fs = 74; x.font = `700 ${fs}px "Avenir LT Std", Avenir, system-ui, sans-serif`;
      let lines = wrap(x, name, R * 1.45);
      while (lines.length > 3 && fs > 40) { fs -= 6; x.font = `700 ${fs}px "Avenir LT Std", Avenir, system-ui, sans-serif`; lines = wrap(x, name, R * 1.45); }
      lines.forEach((l, i) => x.fillText(l, 0, (i - (lines.length - 1) / 2) * fs * 1.1));
    }
    // gloss
    const gl = x.createLinearGradient(0, -R, 0, R * 0.2);
    gl.addColorStop(0, 'rgba(255,255,255,.28)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gl; x.beginPath(); x.ellipse(0, -R * 0.45, R * 0.8, R * 0.5, 0, 0, 7); x.fill();
    x.restore();
    x.lineWidth = 14; x.strokeStyle = kind === 'own' ? BRAND.sec : 'rgba(255,255,255,.75)';
    x.beginPath(); x.arc(0, 0, R, 0, 7); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t;
  }
  async function dsaBadge() {
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'); x.translate(S / 2, S / 2);
    const R = S / 2 - 22;
    const g = x.createRadialGradient(0, 0, R * 0.6, 0, 0, S / 2);
    g.addColorStop(0, 'rgba(255,112,111,.7)'); g.addColorStop(1, 'rgba(255,112,111,0)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, S / 2, 0, 7); x.fill();
    const bg = x.createLinearGradient(-R, -R, R, R); bg.addColorStop(0, '#ff706f'); bg.addColorStop(1, '#8a2bd6');
    x.fillStyle = bg; x.beginPath(); x.arc(0, 0, R, 0, 7); x.fill();
    const logo = await loadImg('/assets/images/Logo.svg');
    if (logo) {
      const o = document.createElement('canvas'); o.width = 400; o.height = 170;
      const ox = o.getContext('2d'); ox.drawImage(logo, 0, 0, 400, 170);
      ox.globalCompositeOperation = 'source-in'; ox.fillStyle = '#fff'; ox.fillRect(0, 0, 400, 170);
      x.drawImage(o, -R * 0.78, -R * 0.33, R * 1.56, R * 0.66);
    }
    x.lineWidth = 12; x.strokeStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.arc(0, 0, R, 0, 7); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t;
  }

  // ---- procedural planets (seeded, no extra downloads) ----
  const rng = (seed) => { let t = seed >>> 0; return () => ((t = (Math.imul(t, 1664525) + 1013904223) >>> 0) / 4294967296); };
  const hash = (str) => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  function noiseFn(seed) {
    const r = rng(seed), G = new Float32Array(16384); for (let i = 0; i < 16384; i++) G[i] = r();
    const sm = (t) => t * t * (3 - 2 * t);
    return (x, y, px) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
      const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((yi % 64) + 64) % 64, y1 = (y0 + 1) % 64;
      const a = G[y0 * 256 + x0], b = G[y0 * 256 + x1], c = G[y1 * 256 + x0], d = G[y1 * 256 + x1];
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
  }
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const ramp = (stops, t) => { t = t > 0 ? Math.min(0.999, t) : 0; const n = stops.length - 1, i = Math.floor(t * n); return mixc(stops[i], stops[i + 1], t * n - i); };
  const TYPES = {
    ocean: { stops: [[8, 30, 90], [18, 80, 160], [40, 130, 90], [150, 130, 80], [235, 235, 240]], kind: 'ocean' },
    gas:   { stops: [[245, 225, 190], [210, 150, 95], [170, 100, 70], [240, 205, 160], [190, 120, 85]], kind: 'gas' },
    rock:  { stops: [[60, 38, 34], [128, 78, 56], [190, 120, 78], [222, 170, 120]], kind: 'rock' },
    ice:   { stops: [[150, 190, 235], [205, 230, 250], [245, 250, 255], [180, 215, 245]], kind: 'ice' },
    lava:  { stops: [[18, 10, 12], [48, 26, 26], [92, 40, 30], [255, 120, 40]], kind: 'lava' },
    violet:{ stops: [[70, 40, 150], [140, 90, 220], [235, 150, 200], [110, 60, 190], [255, 180, 170]], kind: 'gas' },
    teal:  { stops: [[20, 70, 85], [40, 140, 150], [150, 220, 210], [30, 100, 120]], kind: 'gas' },
    coral: { stops: [[120, 40, 60], [255, 112, 111], [255, 190, 150], [170, 60, 90]], kind: 'gas' },
  };
  const TYPE_ORDER = ['coral', 'violet', 'ocean', 'gas', 'ice', 'rock', 'teal', 'lava'];
  function planetTextures(id, typeKey) {
    const T = TYPES[typeKey], W = 512, H = 256, n = noiseFn(hash(id)), n2 = noiseFn(hash(id + 'b'));
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const cc = mk(), bc = mk(), ec = T.kind === 'lava' ? mk() : null;
    const cx = cc.getContext('2d'), bx = bc.getContext('2d'), ex = ec && ec.getContext('2d');
    const ci = cx.createImageData(W, H), bi = bx.createImageData(W, H), ei = ex && ex.createImageData(W, H);
    const fbm = (nf, x, y, o) => { let v = 0, a = 0.5, f = 1, sum = 0; for (let k = 0; k < o; k++) { v += a * nf(x * f, y * f, 4 * f); sum += a; a *= 0.5; f *= 2; } return v / sum; };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = i / W, v = j / H, x = u * 4, y = v * 2, k = (j * W + i) * 4;
      let col, h = 0.5, em = 0;
      if (T.kind === 'gas') {
        const warp = fbm(n, x * 1.2, y * 1.2, 4) * 1.6;
        const band = v * 9 + warp * 1.4 + (fbm(n2, x * 3, y * 0.6, 3) - 0.5) * 0.9;
        col = ramp(T.stops, 0.5 + 0.5 * Math.sin(band * Math.PI * 2));
        h = 0.5 + (fbm(n2, x * 4, y * 4, 3) - 0.5) * 0.15;
      } else if (T.kind === 'ocean') {
        h = fbm(n, x * 1.4, y * 1.4, 5);
        const polar = Math.abs(v - 0.5) > 0.4 + (fbm(n2, x * 4, y * 4, 3) - 0.5) * 0.12;
        if (polar) col = [240, 244, 250];
        else if (h < 0.5) col = mixc(T.stops[0], T.stops[1], Math.min(1, h / 0.5));
        else col = ramp(T.stops.slice(2, 4), (h - 0.5) / 0.3);
        if (!polar && h < 0.5) h = 0.45; // flat sea
      } else if (T.kind === 'rock') {
        h = fbm(n, x * 2, y * 2, 6);
        const crat = Math.pow(fbm(n2, x * 5, y * 5, 2), 3) * 2;
        col = ramp(T.stops, h * 1.25 - crat * 0.25); h = h - crat * 0.12;
      } else if (T.kind === 'ice') {
        h = fbm(n, x * 2, y * 2, 5);
        const crack = 1 - Math.min(1, Math.abs(fbm(n2, x * 4, y * 4, 4) - 0.5) * 9);
        col = mixc(ramp(T.stops, h), [90, 140, 210], crack * 0.55); h = h - crack * 0.1;
      } else { // lava
        h = fbm(n, x * 2, y * 2, 6);
        const crack = 1 - Math.min(1, Math.abs(fbm(n2, x * 3, y * 3, 5) - 0.5) * 7);
        col = ramp(T.stops.slice(0, 3), h); em = Math.pow(crack, 2);
      }
      ci.data[k] = col[0]; ci.data[k + 1] = col[1]; ci.data[k + 2] = col[2]; ci.data[k + 3] = 255;
      const hv = Math.max(0, Math.min(1, h)) * 255; bi.data[k] = bi.data[k + 1] = bi.data[k + 2] = hv; bi.data[k + 3] = 255;
      if (ei) { ei.data[k] = 255 * em; ei.data[k + 1] = 110 * em; ei.data[k + 2] = 30 * em; ei.data[k + 3] = 255; }
    }
    cx.putImageData(ci, 0, 0); bx.putImageData(bi, 0, 0); ex && ex.putImageData(ei, 0, 0);
    const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.anisotropy = maxAniso; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
    return { map: tex(cc, true), bump: tex(bc), emissive: ec ? tex(ec, true) : null };
  }
  const HALO = {
    ocean: [0.35, 0.6, 1.0], gas: [1.0, 0.7, 0.45], rock: [1.0, 0.6, 0.4], ice: [0.6, 0.85, 1.0],
    lava: [1.0, 0.4, 0.2], violet: [0.6, 0.45, 1.0], teal: [0.3, 0.9, 0.85], coral: [1.0, 0.44, 0.43],
  };
  function buildPlanet(it, typeKey, radius, ringed) {
    const tx = planetTextures(it.id, typeKey), g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ map: tx.map, bumpMap: tx.bump, bumpScale: typeKey === 'gas' ? 0.4 : 2.2, roughness: typeKey === 'ocean' ? 0.55 : 0.88, metalness: 0.02 });
    if (tx.emissive) { mat.emissiveMap = tx.emissive; mat.emissive = new THREE.Color(1, 1, 1); mat.emissiveIntensity = 1.2; }
    const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48), mat);
    g.add(body);
    const hc = HALO[typeKey] || HALO.violet;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.22, 48, 32), new THREE.ShaderMaterial({
      uniforms: { c: { value: new THREE.Vector3(...hc) } },
      vertexShader: 'varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);} ',
      fragmentShader: 'varying vec3 vN; uniform vec3 c; void main(){ float f=pow(max(0.,0.72-dot(vN,vec3(0.,0.,1.))),2.6); gl_FragColor=vec4(c,1.)*f*1.1; }',
      side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    })));
    if (ringed) {
      const rg = new THREE.Mesh(new THREE.RingGeometry(radius * 1.45, radius * 2.15, 96), new THREE.MeshBasicMaterial({ color: 0xff706f, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      rg.rotation.x = Math.PI / 2 - 0.35; rg.rotation.y = 0.2; g.add(rg);
    }
    return { group: g, body };
  }

  // ---- moons from the DOM list (single source of truth, crawlable) ----
  const items = [...list.querySelectorAll('li[data-id]')].map((li) => ({
    li, id: li.dataset.id, name: li.dataset.name, tag: li.dataset.tag, desc: li.dataset.desc,
    icon: li.dataset.icon || '', kind: li.dataset.kind, group: li.dataset.group, href: li.querySelector('a').href,
  }));
  const planes = [
    { tilt: [0.15, 0], r: [1.75, 2.0] },
    { tilt: [-0.45, 0.35], r: [2.5, 2.8, 3.1] },
    { tilt: [0.7, -0.5], r: [3.5, 3.8, 4.1] },
  ];
  const moons = [];
  let mobile = false, runEl = null, wrapEl = null, lineW = 1, prog = 0, lineOrder = [];
  const clickable = [];
  // three "solar systems" side by side; the camera flies between them
  const SPACE = 15, SYS_Y = [0, -0.8, 0.8], SYS_Z = [0, -3, -1.5];
  const sysNames = ['sport', 'brands', 'mine'];
  const sysRoot = {}, orbitsOf = {}, orbitGroups = [], spinners = [], centrals = [];
  sysNames.forEach((name, i) => {
    let root = world;
    if (i) { root = new THREE.Group(); root.rotation.x = world.rotation.x; scene.add(root); }
    sysRoot[name] = root;
    orbitsOf[name] = planes.map((p) => {
      const g = new THREE.Group(); g.rotation.set(p.tilt[0], 0, p.tilt[1]); root.add(g); orbitGroups.push(g); return g;
    });
  });
  [['brands', 'gas', 1.15, 'Brands & media'], ['mine', 'teal', 1.05, 'My products']].forEach(([name, type, rad, label]) => {
    try {
      const { group, body } = buildPlanet({ id: 'sys-' + name, name: label }, type, rad, false);
      sysRoot[name].add(group); centrals.push(group); spinners.push(body);
    } catch (e) { console.warn('system planet failed', name, e); }
  });
  function ring(r, g) {
    const pts = []; for (let i = 0; i <= 160; i++) { const a = (i / 160) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xb9a8ff, transparent: true, opacity: 0.16 }));
    g.add(l); return l;
  }
  const ringsOf = {};
  let activeGroup = 'sport';
  const slots = [];
  const gnames = [...new Set(items.map((i) => i.group))];
  gnames.forEach((g) => {
    const mem = items.filter((i) => i.group === g);
    mem.forEach((it, i) => {
      const pl = 1 + (i % 2), r = [2.3, 2.75, 3.2][Math.floor(i / 2) % 3];
      slots.push({ it, group: g, plane: pl, r, size: 0.34 });
    });
  });
  const usedRings = new Set();
  const dsaItem = { id: 'dsa', name: 'Digital Space Agency', tag: 'Home base', desc: 'Digital Space Agency: independent Flutter and mobile studio in Hamburg. Contract and full-time.', href: '/about/', kind: 'dsa' };
  gnames.forEach((g) => slots.push({ it: dsaItem, group: g, plane: 2, r: 3.9, size: 0.6, dsa: true }));

  const perKey = {};
  slots.forEach((s) => { const k = s.group + s.plane; (perKey[k] = perKey[k] || []).push(s); });
  Object.values(perKey).forEach((arr) => arr.forEach((s, i) => { s.phase = (i / arr.length) * Math.PI * 2 + Math.random(); }));

  let typeIdx = 0;
  Promise.all(slots.map(async (s) => { try {
    const key = s.plane + ':' + s.r;
    if (!usedRings.has(s.group + key)) { usedRings.add(s.group + key); ringsOf[s.group] = ringsOf[s.group] || []; ringsOf[s.group].push(ring(s.r, orbitsOf[s.group][s.plane])); }
    const m = { s, speed: (0.5 / Math.pow(s.r, 1.2)) * (s.plane === 2 ? -1 : 1), angle: s.phase, hover: 0, show: 1 };
    if (s.dsa) {
      const tex = await dsaBadge();
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.scale.setScalar(s.size * 1.35); sp.userData = { s, base: s.size * 1.35 };
      orbitsOf[s.group][s.plane].add(sp); m.obj = sp; m.hit = sp; m.dsa = true;
    } else {
      const typeKey = TYPE_ORDER[(typeIdx++) % TYPE_ORDER.length];
      const { group, body } = buildPlanet(s.it, typeKey, s.size, s.it.kind === 'own');
      const proxy = new THREE.Mesh(new THREE.SphereGeometry(s.size * 1.9, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
      proxy.userData = { s }; group.add(proxy);
      orbitsOf[s.group][s.plane].add(group);
      m.obj = group; m.body = body; m.hit = proxy; m.spin = 0.25 + Math.random() * 0.3;
    }
    moons.push(m); if (!s.dsa) s.it.moon = m.hit;
    applyGroup();
  } catch (e) { console.warn('planet failed', s.it.id, e); } }));

  const sysIdx = (g) => Math.max(0, sysNames.indexOf(g));
  let flyTo = 0, flyX = 0, shiftX = 0;
  function layout() { sysNames.forEach((n, i) => sysRoot[n].position.set(i * SPACE + shiftX, SYS_Y[i], SYS_Z[i])); }
  function applyGroup() {
    Object.entries(ringsOf).forEach(([g, ls]) => ls.forEach((l) => { l.visible = true; }));
    clickable.length = 0;
    moons.forEach((m) => { if (mobile || m.s.group === activeGroup) clickable.push(m.hit); });
    if (mobile) syncMobile();
    items.forEach((it) => { it.li.hidden = it.group !== activeGroup; });
    document.querySelectorAll('.gtab').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.group === activeGroup)));
  }
  document.querySelectorAll('.gtab').forEach((b) => b.addEventListener('click', () => {
    activeGroup = b.dataset.group; selected = null; hovered = null; applyGroup(); flyTo = sysIdx(activeGroup) * SPACE;
    if (!panel.hidden) closePanel();
  }));

  // ---- phone layout: one horizontal line of planets, driven by page scroll ----
  const MS = 1.3, GAP = 2.1;
  const lineRoot = new THREE.Group(); lineRoot.visible = false; scene.add(lineRoot);
  function syncMobile() {
    moons.forEach((m) => { if (m.obj.parent !== lineRoot) { m.home = m.home || m.obj.parent; lineRoot.add(m.obj); } m.k = MS; });
    lineOrder = [...moons].sort((a, b) => sysIdx(a.s.group) - sysIdx(b.s.group) || (b.s.dsa ? 1 : 0) - (a.s.dsa ? 1 : 0) || slots.indexOf(a.s) - slots.indexOf(b.s));
    lineOrder.forEach((m, i) => { m.lx = i * GAP; m.ly = Math.sin(i * 1.3) * 0.5; });
    lineW = Math.max((lineOrder.length - 1) * GAP, 1);
  }
  function setMode(on) {
    mobile = on;
    lineRoot.visible = on;
    sysNames.forEach((n) => { sysRoot[n].visible = !on; });
    if (on) {
      if (!runEl) { runEl = document.createElement('div'); runEl.className = 'space-run'; runEl.setAttribute('aria-hidden', 'true'); }
      if (!wrapEl) { wrapEl = document.createElement('div'); wrapEl.className = 'space-wrap'; }
      host.before(wrapEl); wrapEl.append(host, runEl);
      if (!host.querySelector('.mhint')) { const h = document.createElement('p'); h.className = 'mhint'; h.textContent = 'Scroll to fly through the apps \u2193'; host.appendChild(h); }
      syncMobile();
    } else {
      if (wrapEl && wrapEl.parentNode) { wrapEl.before(host); wrapEl.remove(); }
      moons.forEach((m) => { if (m.home) m.home.add(m.obj); m.k = 1; });
      flyX = 0; flyTo = sysIdx(activeGroup) * SPACE;
    }
    applyGroup();
  }
  let capEl = null, capFor = null, stripEl = null;
  function buildStrip() {
    stripEl = document.createElement('div'); stripEl.className = 'mstrip'; stripEl.setAttribute('role', 'tablist');
    lineOrder.forEach((m, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = m.s.it.name; b.dataset.i = i;
      b.addEventListener('click', () => {
        const stick = parseFloat(getComputedStyle(host).top) || 0;
        const f = lineOrder.length > 1 ? i / (lineOrder.length - 1) : 0;
        const top = runEl.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: top - (stick + host.clientHeight) + f * runEl.offsetHeight + 1, behavior: 'smooth' });
      });
      stripEl.appendChild(b);
    });
    host.appendChild(stripEl);
  }
  function caption(m) {
    if (!capEl) { capEl = document.createElement('div'); capEl.className = 'mcap'; host.appendChild(capEl); }
    if (!stripEl && lineOrder.length) buildStrip();
    if (m === capFor) return; capFor = m;
    if (stripEl && m) {
      const k = lineOrder.indexOf(m);
      [...stripEl.children].forEach((b, i) => b.classList.toggle('on', i === k));
      const b = stripEl.children[k];
      if (b) stripEl.scrollTo({ left: b.offsetLeft - (stripEl.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
    }
    if (!m) { capEl.hidden = true; return; }
    const it = m.s.it; capEl.hidden = false; capEl.textContent = '';
    const mk = (tag, cls, txt) => { const e = document.createElement(tag); e.className = cls; e.textContent = txt; capEl.appendChild(e); return e; };
    mk('p', 't', it.tag || '');
    mk('p', 'n', it.name);
    mk('p', 'd', it.desc || '');
    const a = mk('a', 'l', it.id === 'dsa' ? 'About David' : 'See in Work'); a.href = it.href;
    mk('p', 's', (lineOrder.indexOf(m) + 1) + ' / ' + lineOrder.length + '  ·  keep scrolling to fly on');
  }
  function updateProg() {
    if (!runEl) return;
    const stick = parseFloat(getComputedStyle(host).top) || 0;
    prog = Math.min(Math.max((stick + host.clientHeight - runEl.getBoundingClientRect().top) / (runEl.offsetHeight || 1), 0), 1);
  }

  // ---- sizing ----
  let baseZ = 11.5;
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const wide = w > 900;
    const phone = w <= 700; if (phone !== mobile) setMode(phone);
    const top = document.querySelector('.top'); if (top) document.documentElement.style.setProperty('--hdr', top.offsetHeight + 'px');
    baseZ = phone ? 10 : wide ? 11.5 : w > 600 ? 14.5 : 15;
    shiftX = wide ? 3.4 : w > 600 ? 2.2 : 0; layout();
    const k = wide ? 1.05 : 0.9;
    planet.scale.setScalar(k); atmo.scale.setScalar(k); centrals.forEach((c) => c.scale.setScalar(k));
    orbitGroups.forEach((g) => g.scale.setScalar(wide ? 1 : 0.92));
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();

  // ---- name chip shown under the hovered / selected planet ----
  const pchip = document.createElement('div');
  pchip.className = 'pchip'; pchip.setAttribute('aria-hidden', 'true');
  host.appendChild(pchip);
  let chipFor = null;
  const _v = new THREE.Vector3();
  function updateChip(m) {
    if (!m || m.dsa) { pchip.classList.remove('on'); chipFor = null; return; }
    if (chipFor !== m) { chipFor = m; pchip.textContent = m.s.it.name; pchip.dataset.kind = m.s.it.kind; }
    m.obj.getWorldPosition(_v);
    const dist = camera.position.distanceTo(_v);
    const ppu = host.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist);
    _v.project(camera);
    const x = (_v.x * 0.5 + 0.5) * host.clientWidth, y = (-_v.y * 0.5 + 0.5) * host.clientHeight;
    const half = (pchip.offsetWidth || 0) / 2 + 8, cx = Math.min(Math.max(x, half), host.clientWidth - half);
    pchip.style.transform = `translate(${cx.toFixed(1)}px, ${(y + m.s.size * (m.k || 1) * m.hover * ppu * m.obj.parent.scale.x + 10).toFixed(1)}px) translateX(-50%)`;
    pchip.classList.add('on');
  }

  // ---- interaction ----
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  let hovered = null, selected = null, drag = null, vel = 0, moved = 0, px = 0, py = 0, tx = 0, ty = 0;
  const el = renderer.domElement;
  el.style.touchAction = 'pan-y';
  el.parentElement.style.cursor = 'grab';

  function pick(e) {
    const r = el.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(clickable, false)[0];
    return hit ? hit.object : null;
  }
  const idOf = (sp) => sp && sp.userData.s.it.id;

  function setHover(sp, e) {
    if (hovered === sp) { if (sp && e) place(e); return; }
    hovered = sp;
    el.parentElement.style.cursor = sp ? 'pointer' : drag ? 'grabbing' : 'grab';
    list.querySelectorAll('[data-id]').forEach((li) => li.classList.toggle('on', sp && li.dataset.id === idOf(sp)));
    tip.hidden = true;
  }
  function place(e) { tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`; }

  el.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; moved = 0; el.setPointerCapture(e.pointerId); el.parentElement.style.cursor = 'grabbing'; });
  el.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      moved += Math.abs(dx) + Math.abs(dy);
      world.rotation.y += dx * 0.006; vel = dx * 0.006;
      if (e.pointerType === 'mouse') world.rotation.x = THREE.MathUtils.clamp(world.rotation.x + dy * 0.004, -0.2, 0.8);
      drag.x = e.clientX; drag.y = e.clientY;
    } else if (e.pointerType === 'mouse') { setHover(pick(e), e); }
    tx = (e.clientX / innerWidth - 0.5); ty = (e.clientY / innerHeight - 0.5);
  });
  el.addEventListener('pointerup', (e) => {
    const was = drag; drag = null; el.parentElement.style.cursor = hovered ? 'pointer' : 'grab';
    if (was && moved < 6) { const sp = pick(e); if (sp) openPanel(sp.userData.s.it); }
  });
  el.addEventListener('pointerleave', () => { if (!drag) setHover(null); });

  // ---- panel ----
  let lastFocus = null;
  function openPanel(it) {
    selected = it.moon || null; lastFocus = document.activeElement;
    panel.querySelector('.p-tag').textContent = it.tag || '';
    panel.querySelector('.p-name').textContent = it.name;
    panel.querySelector('.p-desc').textContent = it.desc;
    const a = panel.querySelector('.p-link'); a.href = it.href;
    a.textContent = it.id === 'dsa' ? 'About David' : 'See in Work';
    panel.hidden = false; requestAnimationFrame(() => panel.classList.add('open'));
    panel.querySelector('.p-close').focus();
  }
  function closePanel() { panel.classList.remove('open'); selected = null; setTimeout(() => { panel.hidden = true; }, 250); lastFocus && lastFocus.focus && lastFocus.focus(); }
  panel.querySelector('.p-close').addEventListener('click', closePanel);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) closePanel(); });

  // chips (real links) drive the same scene
  items.forEach((it) => {
    const a = it.li.querySelector('a');
    a.addEventListener('click', (e) => { e.preventDefault(); openPanel(it); });
    a.addEventListener('pointerenter', () => { setHover(it.moon || null); tip.hidden = true; });
    a.addEventListener('pointerleave', () => setHover(null));
    a.addEventListener('focus', () => setHover(it.moon || null));
    a.addEventListener('blur', () => setHover(null));
  });

  // ---- loop ----
  let visible = true, last = performance.now();
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; }).observe(host);
  const speedK = reduce ? 0.12 : 1;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!visible || document.hidden) return;
    if (mobile) updateProg();
    if (!drag) { world.rotation.y += (vel + (reduce ? 0.0004 : 0.0012)) * (1); vel *= 0.94; }
    earth.rotation.y += dt * 0.035 * speedK; clouds.rotation.y += dt * 0.045 * speedK;
    stars.rotation.y += dt * 0.004 * speedK;
    if (mobile) { flyX += (prog * lineW - flyX) * (reduce ? 1 : 1 - Math.exp(-dt * 7)); } else flyX += (flyTo - flyX) * (reduce ? 1 : 1 - Math.exp(-dt * 2.6));
    const away = mobile ? 0 : Math.abs(flyTo - flyX);
    sysNames.forEach((n, i) => { if (i) { sysRoot[n].rotation.y = world.rotation.y; sysRoot[n].rotation.x = world.rotation.x; } });
    spinners.forEach((b) => { b.rotation.y += dt * 0.12 * speedK; });
    stars.position.x = flyX * 0.85;
    if (mobile) { camera.position.set(flyX, 0, baseZ); camera.lookAt(flyX, -1.9, 0); stars.position.x = flyX * 0.6; }
    else {
    camera.position.x += (flyX + tx * 0.9 - camera.position.x) * 0.2;
    camera.position.y += (0.6 - ty * 0.7 - camera.position.y) * 0.04;
    camera.position.z = baseZ + Math.min(away, SPACE) * 0.55;
    camera.lookAt(flyX + shiftX * 0.15, 0, 0);
    }
    const near = mobile ? lineOrder[Math.min(Math.max(Math.round(flyX / GAP), 0), lineOrder.length - 1)] : null;
    for (const m of moons) {
      const active = hovered === m.hit || selected === m.hit || m === near;
      if (mobile) {
        m.obj.position.set(m.lx, m.ly + Math.sin(now / 1400 + m.lx) * 0.07, 0);
        m.hover += ((active ? 1.2 : 1) - m.hover) * 0.15;
        m.obj.scale.setScalar(Math.max(m.dsa ? m.obj.userData.base * MS * m.hover : MS * m.hover * m.show, 0.001));
        if (!m.dsa) m.body.rotation.y += dt * m.spin * speedK;
        continue;
      }
      if (!active) m.angle += m.speed * dt * speedK;
      const r = m.s.r, x = Math.cos(m.angle) * r, z = Math.sin(m.angle) * r;
      m.obj.position.set(x, 0, z);
      m.hover += ((active ? 1.3 : 1) - m.hover) * 0.15;
      if (m.dsa) { m.obj.scale.setScalar(m.obj.userData.base * m.hover); continue; }
      m.obj.scale.setScalar(Math.max(m.hover * m.show, 0.001));
      m.body.rotation.y += dt * m.spin * speedK;
    }
    const act = moons.find((m) => m.hit === hovered) || moons.find((m) => m.hit === selected);
    if (mobile) caption(near);
    updateChip(mobile ? null : act);
    renderer.render(scene, camera);
  }

  mgr.onLoad = () => { loader && loader.classList.add('done'); setTimeout(() => loader && loader.remove(), 900); };
  requestAnimationFrame(frame);
  // safety: never leave the loader up
  setTimeout(() => loader && loader.classList.add('done'), 6000);
}

boot();
