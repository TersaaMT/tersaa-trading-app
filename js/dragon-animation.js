import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.getElementById("dragonCanvas");
const parent = canvas ? canvas.parentElement : document.body;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setSize(parent.offsetWidth, parent.offsetHeight);
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, parent.offsetWidth / parent.offsetHeight, 0.1, 1000);
camera.position.set(0, 0, 3);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableZoom = false;
controls.enablePan = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;

// === адаптивный масштаб ===
let baseScale = window.innerWidth < 768 ? 0.25 : 0.45;


// === Материалы контуров ===
function makeLineMaterial(r, g, b) {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0.0 } },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec3 vPos;
      void main() {
        float glow = 0.6 + 0.4 * sin(time + length(vPos) * 5.0);
        gl_FragColor = vec4(${r}, ${g}, ${b}, glow);
      }
    `,
    transparent: true
  });
}
const greenLineMaterial = makeLineMaterial(0.0, 1.0, 0.0);
const redLineMaterial   = makeLineMaterial(1.0, 0.0, 0.0);

// === Материалы ауры ===
function makeEnergyMaterial(r, g, b) {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0.0 } },
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec3 vNormal;

      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float noise(vec3 p){
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f*f*(3.0-2.0*f);
        float n = mix(
          mix(mix(hash(i+vec3(0,0,0)), hash(i+vec3(1,0,0)), f.x),
              mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
              mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
        return n;
      }

      void main() {
        float n = noise(vNormal * 5.0 + vec3(time*0.3, time*0.2, time*0.4));
        float grain = fract(sin(dot(vNormal.xy * 150.0, vec2(12.9898,78.233))) * 43758.5453 + time*5.0);
        float mask = step(0.75, grain);
        float alpha = smoothstep(0.3, 0.8, n) * mask * 0.8;

        vec3 color = vec3(${r}, ${g}, ${b}) * (0.7 + 0.3 * sin(time*2.0));
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
}

// === Группы ===
const greenGroup = new THREE.Group();
scene.add(greenGroup);
const redGroup = new THREE.Group();
redGroup.scale.set(0, 0, 0);
scene.add(redGroup);

// === Ауры ===
const greenAura = new THREE.Mesh(new THREE.SphereGeometry(baseScale, 64, 64), makeEnergyMaterial(0.0, 1.0, 0.0));
greenGroup.add(greenAura);

const redAura = new THREE.Mesh(new THREE.SphereGeometry(baseScale * 0.5, 64, 64), makeEnergyMaterial(1.0, 0.0, 0.0));
redGroup.add(redAura);

// === Континенты ===
fetch("https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json")
  .then(res => res.json())
  .then(data => {
    data.features.forEach(feature => {
      const coords = feature.geometry.coordinates;
      const isMulti = feature.geometry.type === "MultiPolygon";
      coords.forEach(poly => {
        const rings = isMulti ? poly : [poly];
        rings.forEach(ring => {
          const points = [];
          ring.forEach(c => {
            const lat = (c[1] * Math.PI) / 180;
            const lon = (c[0] * Math.PI) / 180;
            const r = baseScale;
            const x = r * Math.cos(lat) * Math.cos(lon);
            const y = r * Math.sin(lat);
            const z = r * Math.cos(lat) * Math.sin(lon);
            points.push(new THREE.Vector3(x, y, z));
          });
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          greenGroup.add(new THREE.Line(geometry, greenLineMaterial));
          redGroup.add(new THREE.Line(geometry, redLineMaterial));
        });
      });
    });
  });

// === Анимация ===
const appearDuration = 2.0;
let startTime = null;

function animate(t) {
  requestAnimationFrame(animate);
  const time = t * 0.001;
  if (!startTime) startTime = time;
  const elapsed = time - startTime;
  const progress = Math.min(elapsed / appearDuration, 1);

  const scale = THREE.MathUtils.lerp(0, baseScale * 1.4, progress); 
  redGroup.scale.set(scale, scale, scale);

  greenLineMaterial.uniforms.time.value = time;
  redLineMaterial.uniforms.time.value = time;
  greenAura.material.uniforms.time.value = time;
  redAura.material.uniforms.time.value = time;

  redGroup.rotation.y -= 0.01;
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
  const width = parent.offsetWidth;
  const height = parent.offsetHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);

  // пересчитываем размер при ресайзе
  baseScale = window.innerWidth < 768 ? 0.15 : 0.25;
});
