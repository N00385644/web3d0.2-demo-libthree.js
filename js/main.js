/* ══════════════ AETHER STUDIO — Motor 3D ══════════════ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ───────── Base ───────── */
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050508, 0.045);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 0, 9);

/* ───────── Núcleo: Icosaedro con ruido orgánico (GLSL) ───────── */
const noiseGLSL = /* glsl */`
  vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0,0.5,1.0,2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0,i1.z,i2.z,1.0)) + i.y + vec4(0.0,i1.y,i2.y,1.0)) + i.x + vec4(0.0,i1.x,i2.x,1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0*floor(p*ns.z*ns.z);
    vec4 x_ = floor(j*ns.z);
    vec4 y_ = floor(j-7.0*x_);
    vec4 x = x_*ns.x + ns.yyyy;
    vec4 y = y_*ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0+1.0;
    vec4 s1 = floor(b1)*2.0+1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy,h.x); vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z); vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
    vec4 m = max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
    m = m*m;
    return 42.0*dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
`;

const coreUniforms = {
  uTime: { value: 0 },
  uAmp: { value: 0.55 },
  uColorA: { value: new THREE.Color(0x7b5cff) },
  uColorB: { value: new THREE.Color(0xb8ff2e) },
};

const coreMat = new THREE.ShaderMaterial({
  uniforms: coreUniforms,
  vertexShader: /* glsl */`
    uniform float uTime;
    uniform float uAmp;
    varying float vDisp;
    varying vec3 vNormal;
    varying vec3 vView;
    ${noiseGLSL}
    void main(){
      float n = snoise(normal * 1.4 + uTime * 0.35);
      vDisp = n;
      vec3 pos = position + normal * n * uAmp;
      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    varying float vDisp;
    varying vec3 vNormal;
    varying vec3 vView;
    void main(){
      float fres = pow(1.0 - abs(dot(vNormal, vView)), 2.5);
      vec3 col = mix(uColorA, uColorB, smoothstep(-0.6, 0.9, vDisp));
      col = col * (0.12 + fres * 0.9);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});

const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 96), coreMat);
scene.add(core);

// Capa wireframe exterior
const shell = new THREE.Mesh(
  new THREE.IcosahedronGeometry(2.9, 2),
  new THREE.MeshBasicMaterial({ color: 0x7b5cff, wireframe: true, transparent: true, opacity: 0.08 })
);
scene.add(shell);

/* ───────── Anillos orbitales ───────── */
const rings = new THREE.Group();
for (let i = 0; i < 3; i++) {
  const r = new THREE.Mesh(
    new THREE.TorusGeometry(3.6 + i * 0.9, 0.008, 8, 220),
    new THREE.MeshBasicMaterial({ color: i === 1 ? 0xb8ff2e : 0xffffff, transparent: true, opacity: 0.28 })
  );
  r.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  r.userData.speed = 0.08 + i * 0.05;
  rings.add(r);
}
scene.add(rings);

/* ───────── Galaxia de partículas (shader) ───────── */
const COUNT = 14000;
const pos = new Float32Array(COUNT * 3);
const aScale = new Float32Array(COUNT);
const aRand = new Float32Array(COUNT);
for (let i = 0; i < COUNT; i++) {
  const radius = 7 + Math.pow(Math.random(), 1.8) * 55;
  const angle = Math.random() * Math.PI * 2;
  const y = (Math.random() - 0.5) * (18 / (radius * 0.15 + 1));
  pos[i * 3] = Math.cos(angle) * radius;
  pos[i * 3 + 1] = y;
  pos[i * 3 + 2] = Math.sin(angle) * radius;
  aScale[i] = Math.random();
  aRand[i] = Math.random();
}
const galaxyGeo = new THREE.BufferGeometry();
galaxyGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
galaxyGeo.setAttribute('aScale', new THREE.BufferAttribute(aScale, 1));
galaxyGeo.setAttribute('aRand', new THREE.BufferAttribute(aRand, 1));

const galaxyUniforms = {
  uTime: { value: 0 },
  uPixelRatio: { value: Math.min(devicePixelRatio, 2) },
  uScroll: { value: 0 },
};
const galaxy = new THREE.Points(galaxyGeo, new THREE.ShaderMaterial({
  uniforms: galaxyUniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    uniform float uTime;
    uniform float uPixelRatio;
    uniform float uScroll;
    attribute float aScale;
    attribute float aRand;
    varying float vFade;
    void main(){
      vec3 p = position;
      float ang = uTime * (0.12 / (0.4 + aRand));
      float c = cos(ang), s = sin(ang);
      p.xz = mat2(c, -s, s, c) * p.xz;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      mv.z += uScroll * 6.0;
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aScale * 3.2 * uPixelRatio * (10.0 / -mv.z);
      vFade = aRand;
    }
  `,
  fragmentShader: /* glsl */`
    varying float vFade;
    void main(){
      float d = length(gl_PointCoord - 0.5);
      float alpha = smoothstep(0.5, 0.0, d);
      vec3 col = mix(vec3(0.48,0.36,1.0), vec3(0.72,1.0,0.18), vFade) * 0.55;
      gl_FragColor = vec4(col, alpha * 0.32);
    }
  `,
}));
scene.add(galaxy);

/* ───────── Post-procesado (Bloom) ───────── */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.55, 0.35);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ───────── Interacción: mouse + scroll ───────── */
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
let scrollT = 0, scrollCur = 0;

addEventListener('pointermove', (e) => {
  mouse.tx = (e.clientX / innerWidth - 0.5) * 2;
  mouse.ty = (e.clientY / innerHeight - 0.5) * 2;
  const dot = document.getElementById('cursorDot');
  const ring = document.getElementById('cursorRing');
  dot.style.left = e.clientX + 'px';
  dot.style.top = e.clientY + 'px';
  ring.animate(
    { left: e.clientX + 'px', top: e.clientY + 'px' },
    { duration: 450, fill: 'forwards', easing: 'cubic-bezier(.2,.8,.2,1)' }
  );
});

document.querySelectorAll('a, .work-item, .nav-cta').forEach((el) => {
  el.addEventListener('mouseenter', () => document.getElementById('cursorRing').classList.add('hovering'));
  el.addEventListener('mouseleave', () => document.getElementById('cursorRing').classList.remove('hovering'));
});

addEventListener('scroll', () => {
  const max = document.body.scrollHeight - innerHeight;
  scrollT = max > 0 ? scrollY / max : 0;
  document.getElementById('scrollPct').textContent = String(Math.round(scrollT * 100)).padStart(3, '0');
});

/* ───────── Resaltar sección según scroll (desplazamiento lateral) ───────── */
const sections = ['hero', 'about', 'work', 'contact'].map(id => document.getElementById(id));

/* ───────── Loop ───────── */
const clock = new THREE.Clock();
function tick() {
  const t = clock.getElapsedTime();
  mouse.x += (mouse.tx - mouse.x) * 0.05;
  mouse.y += (mouse.ty - mouse.y) * 0.05;
  scrollCur += (scrollT - scrollCur) * 0.07;

  coreUniforms.uTime.value = t;
  galaxyUniforms.uTime.value = t;
  galaxyUniforms.uScroll.value = scrollCur;

  core.rotation.y = t * 0.15;
  core.rotation.x = t * 0.08;
  shell.rotation.y = -t * 0.1;
  shell.rotation.z = t * 0.05;
  rings.children.forEach((r) => {
    r.rotation.x += r.userData.speed * 0.004;
    r.rotation.y += r.userData.speed * 0.006;
  });

  // Cámara: parallax + viaje por secciones
  const sectionIdx = scrollCur * 3; // 0..3
  const sideX = Math.sin(sectionIdx * Math.PI) * 2.6; // 0 -> 0, alternando posición
  camera.position.x = mouse.x * 0.7 + sideX * Math.sin(sectionIdx * Math.PI * 7) * 0.12;
  camera.position.y = -mouse.y * 0.5 + Math.sin(t * 0.4) * 0.12;
  camera.position.z = 9 - scrollCur * 2.2;
  camera.lookAt(0, 0, 0);

  bloom.strength = 0.42 + Math.sin(t * 0.8) * 0.06;

  composer.render();
  requestAnimationFrame(tick);
}
tick();

/* ───────── Resize ───────── */
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  galaxyUniforms.uPixelRatio.value = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});

/* ═════════ UI: preloader, reveals, contadores ═════════ */
(function preloader() {
  const el = document.getElementById('preloader');
  const pct = document.getElementById('loaderPct');
  let p = 0;
  const iv = setInterval(() => {
    p = Math.min(100, p + Math.random() * 16);
    pct.textContent = Math.floor(p) + '%';
    if (p >= 100) {
      clearInterval(iv);
      setTimeout(() => el.classList.add('done'), 300);
    }
  }, 90);
})();

const io = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (!en.isIntersecting) return;
    en.target.classList.add('in');
    const counter = en.target.querySelector?.('[data-count]');
    if (en.target.classList.contains('stats')) {
      en.target.querySelectorAll('[data-count]').forEach(animateCount);
    }
    io.unobserve(en.target);
  });
}, { threshold: 0.2 });

document.querySelectorAll('.reveal').forEach((el, i) => {
  el.style.transitionDelay = (i % 6) * 90 + 'ms';
  io.observe(el);
});

function animateCount(el) {
  const target = +el.dataset.count;
  const start = performance.now();
  (function step(now) {
    const k = Math.min(1, (now - start) / 1400);
    el.textContent = Math.floor(target * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  })(start);
}

/* ───────── Botones magnéticos ───────── */
document.querySelectorAll('.magnetic').forEach((el) => {
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - r.height / 2;
    el.style.transform = `translate(${x * 0.25}px, ${y * 0.25}px)`;
  });
  el.addEventListener('pointerleave', () => { el.style.transform = ''; });
});
