// North N² hero scene: a black-glass N² monolith on a mirror floor, rim-lit, with bloom.
// Bundled to assets/hero.js (classic script, so the page also works when opened from disk):
//   npm install && npm run build
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const canvas = document.getElementById('scene');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function canvasTexture(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

async function start() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    document.documentElement.classList.add('no-webgl');
    return;
  }
  // Fonts must be ready before the N² is painted onto the monolith face.
  await Promise.race([document.fonts.load('300 200px Montserrat'), new Promise((r) => setTimeout(r, 1500))]);

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.075);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 1.1;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

  // --- backdrop: a soft vertical haze behind the monolith (the "portal" of light)
  const haze = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 14),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(512, 512, (x, w, h) => {
        const g = x.createRadialGradient(w / 2, h * 0.62, 0, w / 2, h * 0.62, w * 0.5);
        g.addColorStop(0, 'rgba(120,120,120,1)');
        g.addColorStop(0.35, 'rgba(40,40,40,1)');
        g.addColorStop(1, 'rgba(0,0,0,1)');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      }),
      fog: false,
    }),
  );
  haze.position.set(0, 3.2, -9);
  scene.add(haze);

  // --- distant ridgelines, barely-there silhouettes for depth
  const ridgeMat = new THREE.MeshBasicMaterial({ color: 0x050505, fog: true });
  for (const side of [-1, 1]) {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(0, 4.2);
    s.bezierCurveTo(1.6, 3.6, 3.2, 1.6, 5.4, 0.25);
    s.lineTo(6.5, 0); s.lineTo(0, 0);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s, 32), ridgeMat);
    m.scale.x = -side;
    m.position.set(side * 9.5, 0, -7);
    scene.add(m);
  }

  // --- the monolith
  const W = 1.5, H = 2.7, D = 0.42;
  const mono = new THREE.Group();
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(W, H, D, 6, 0.035),
    new THREE.MeshPhysicalMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06 }),
  );
  mono.add(body);

  // N² engraved on the front: silver gradient, slightly emissive so bloom catches it.
  const face = canvasTexture(1024, 1844, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    // faint diagonal sheen, like light raking across polished glass
    const sh = x.createLinearGradient(0, 0, w, h);
    sh.addColorStop(0.2, 'rgba(255,255,255,0)'); sh.addColorStop(0.42, 'rgba(255,255,255,0.07)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.11)'); sh.addColorStop(0.6, 'rgba(255,255,255,0)');
    x.fillStyle = sh; x.fillRect(0, 0, w, h);
    const g = x.createLinearGradient(w * 0.8, h * 0.25, w * 0.2, h * 0.8);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#c4c4c4'); g.addColorStop(1, '#6a6a6a');
    x.strokeStyle = g; x.fillStyle = g;
    x.lineWidth = 11; x.lineJoin = 'miter';
    const nx = w * 0.27, nw = w * 0.4, ny = h * 0.38, nh = h * 0.26;
    x.beginPath(); x.moveTo(nx, ny + nh); x.lineTo(nx, ny); x.lineTo(nx + nw, ny + nh); x.lineTo(nx + nw, ny); x.stroke();
    x.font = '300 120px Montserrat, sans-serif'; x.textBaseline = 'top';
    x.fillText('2', nx + nw + 18, ny - 52);
    // hairline frame inset, like an architectural plate
    x.globalAlpha = 0.25; x.lineWidth = 2; x.strokeStyle = '#bdbdbd';
    x.strokeRect(w * 0.08, h * 0.045, w * 0.84, h * 0.91);
  });
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 0.98, H * 0.98),
    new THREE.MeshBasicMaterial({ map: face, transparent: true, toneMapped: false }),
  );
  plate.position.z = D / 2 + 0.002;
  mono.add(plate);

  // Thin luminous edges.
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, toneMapped: false }),
  );
  mono.add(edges);
  mono.position.y = H / 2 + 0.02;
  scene.add(mono);

  // --- light: key from above-front, cool rim from behind, pool of light on the floor
  const key = new THREE.SpotLight(0xffffff, 140, 20, 0.4, 0.75, 1.3);
  key.position.set(2.5, 7, 4.5);
  key.target = mono;
  scene.add(key);
  const rim = new THREE.PointLight(0xdedede, 26, 9, 1.6);
  rim.position.set(0, 2.6, -2.2);
  scene.add(rim);
  const side = new THREE.SpotLight(0xffffff, 90, 14, 0.3, 0.9, 1.4);
  side.position.set(-5, 2.2, 1.5);
  side.target = mono;
  scene.add(side);
  scene.add(new THREE.AmbientLight(0xffffff, 0.06));

  // --- mirror floor, with a radial falloff so the reflection fades like polished stone
  const mirror = new Reflector(new THREE.PlaneGeometry(60, 60), {
    textureWidth: innerWidth * Math.min(devicePixelRatio, 2) * 0.5,
    textureHeight: innerHeight * Math.min(devicePixelRatio, 2) * 0.5,
    color: 0x6a6a6a,
  });
  mirror.rotation.x = -Math.PI / 2;
  scene.add(mirror);
  const sheen = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshBasicMaterial({
      transparent: true,
      color: 0x000000,
      alphaMap: canvasTexture(512, 512, (x, w, h) => {
        const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, '#2a2a2a'); g.addColorStop(0.06, '#555555'); g.addColorStop(0.3, '#a8a8a8'); g.addColorStop(0.7, '#e2e2e2'); g.addColorStop(1, '#f5f5f5');
        x.fillStyle = g; x.fillRect(0, 0, w, h);
      }),
    }),
  );
  sheen.rotation.x = -Math.PI / 2;
  sheen.position.y = 0.003;
  scene.add(sheen);

  // --- slow dust in the light
  const N = 700, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 14;
    pos[i * 3 + 1] = Math.random() * 6;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 10 - 1;
    seed[i] = Math.random() * 100;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      size: 0.018, color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
      map: canvasTexture(64, 64, (x, w) => {
        const g = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(0, 0, w, w);
      }),
    }),
  );
  scene.add(dust);

  // --- post
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.85, 0.72);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // --- layout: keep the monolith above the headline at any aspect ratio
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
    camera.aspect = w / h;
    const portrait = w / h < 0.9;
    camera.fov = portrait ? 40 : 26;
    camera.position.set(0, portrait ? 1.6 : 1.45, portrait ? 16 : 19);
    // Shift the view so the floor line sits just above the headline, leaving room for the copy below.
    camera.setViewOffset(w, h, 0, h * (portrait ? 0.16 : 0.1), w, h);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // --- motion
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / innerWidth - 0.5) * 2;
    mouse.ty = (e.clientY / innerHeight - 0.5) * 2;
  });
  const clock = new THREE.Clock();
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);

  function tick() {
    requestAnimationFrame(tick);
    if (!visible) return;
    const t = reduceMotion ? 0 : clock.getElapsedTime();
    const intro = Math.min(1, t / 2.2), ease = 1 - Math.pow(1 - intro, 3);
    mono.rotation.y = -0.55 + ease * 0.55 + Math.sin(t * 0.22) * 0.38;
    mono.position.y = H / 2 + 0.02 + Math.sin(t * 0.6) * 0.03;
    renderer.toneMappingExposure = 0.2 + ease * 0.75;
    rim.intensity = 22 + Math.sin(t * 0.5) * 6;
    const p = dustGeo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      p[i * 3 + 1] += 0.0016 + Math.sin(t * 0.3 + seed[i]) * 0.0008;
      p[i * 3] += Math.sin(t * 0.2 + seed[i]) * 0.0012;
      if (p[i * 3 + 1] > 6) p[i * 3 + 1] = 0;
    }
    dustGeo.attributes.position.needsUpdate = true;
    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;
    camera.position.x = mouse.x * 0.6;
    camera.lookAt(0, 1.35 - mouse.y * 0.15, 0);
    composer.render();
  }
  tick();
  document.documentElement.classList.add('scene-ready');
}

start();
