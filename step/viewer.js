/* 3D-preview (Fase 3.3): three.js, lazy geladen vanaf jsdelivr. Werkt op elke getrianguleerde
   mesh (positions/indices) — dus onafhankelijk testbaar met synthetische geometrie, ook al is de
   STEP-parsing zelf (step-worker.js) ongeverifieerd. Dat is in deze sessie ook precies gedaan:
   zie step/README.md voor het verificatieverslag (procedurele testkubus, niet een echt STEP-
   afgeleide mesh). Prestatiebudget (200k driehoeken): findExcessiveMesh() waarschuwt, decimeert
   niet zelf (geen extra library) maar valt terug op een bbox-wireframe. */

const STEP_THREE_VERSION = '0.160.0';
const STEP_ORBIT_URL = 'https://cdn.jsdelivr.net/npm/three@' + STEP_THREE_VERSION + '/examples/jsm/controls/OrbitControls.js';
const STEP_TRIANGLE_BUDGET = 200000;

// OrbitControls.js importeert intern de kale specifier "three" (geen relatief pad) — dat werkt
// alleen als de pagina een importmap heeft die "three" naar de CDN-URL wijst. Zonder importmap
// faalt de dynamic import van OrbitControls met "Failed to resolve module specifier three", ook
// al lijkt de eigen import van three.module.js prima te werken — dit is in de Browser-pane
// daadwerkelijk zo gereproduceerd vóór deze fix (zie step/README.md). werkbank-v2.html's <head>
// krijgt daarom een <script type="importmap"> via scripts/promote-step.js.
let stepThreeModules = null;
function loadStepThree() {
  if (stepThreeModules) return stepThreeModules;
  stepThreeModules = Promise.all([import('three'), import(STEP_ORBIT_URL)])
    .then(([THREE, orbit]) => ({ THREE, OrbitControls: orbit.OrbitControls }));
  return stepThreeModules;
}
// Puur: telt driehoeken, geeft aan of decimatie/wireframe-fallback nodig is (geen library voor
// echte decimatie — buiten scope, wel duidelijk gemeld in de UI).
function meshTriangleCount(indices, positionsLength) { return indices ? indices.length / 3 : (positionsLength / 3) / 3; }
function exceedsTriangleBudget(totalTriangles) { return totalTriangles > STEP_TRIANGLE_BUDGET; }

async function createStepViewer(container) {
  const { THREE, OrbitControls } = await loadStepThree();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--paper') ? 0xf3f5f7 : 0xffffff);
  const camera = new THREE.PerspectiveCamera(45, Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight), 1, 1e7);
  camera.position.set(500, 500, 500);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 0.7); dir.position.set(1, 1, 1); scene.add(dir);
  const group = new THREE.Group(); scene.add(group);
  let sectionOn = false, running = true;
  (function animate() { if (!running) return; requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); })();

  function addMesh(bodyId, positions, indices, color) {
    const triangles = meshTriangleCount(indices, positions.length);
    if (exceedsTriangleBudget(triangles)) {
      const box = new THREE.Box3(); const pos = new THREE.Float32BufferAttribute(positions, 3);
      box.setFromBufferAttribute(pos);
      const helper = new THREE.Box3Helper(box, new THREE.Color(0x667487));
      helper.userData.bodyId = bodyId; group.add(helper);
      return { mesh: helper, wireframeFallback: true };
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (indices) geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: color || 0x8a97a5, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.bodyId = bodyId;
    group.add(mesh);
    return { mesh, wireframeFallback: false };
  }
  function fitToView() {
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    camera.position.copy(center).clone().add(new THREE.Vector3(maxDim, maxDim, maxDim));
    camera.near = maxDim / 1000; camera.far = maxDim * 100; camera.updateProjectionMatrix();
    controls.target.copy(center); controls.update();
  }
  function highlight(bodyId) {
    group.children.forEach(m => { if (m.material && 'emissive' in m.material) { m.material.emissive = new THREE.Color(m.userData.bodyId === bodyId ? 0xf26b1d : 0x000000); m.material.emissiveIntensity = m.userData.bodyId === bodyId ? 0.4 : 0; } });
  }
  function toggleSection() {
    sectionOn = !sectionOn;
    const box = new THREE.Box3().setFromObject(group);
    const mid = box.getCenter(new THREE.Vector3());
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), mid.y);
    group.children.forEach(m => { if (m.material) m.material.clippingPlanes = sectionOn ? [plane] : []; });
    return sectionOn;
  }
  function toIsoPng() {
    fitToView();
    camera.position.set(1, 1, 1).normalize().multiplyScalar(camera.position.length() || 1000);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  }
  function resize() { camera.aspect = container.clientWidth / container.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(container.clientWidth, container.clientHeight); }
  function dispose() { running = false; renderer.dispose(); if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement); }
  return { addMesh, fitToView, highlight, toggleSection, toIsoPng, resize, dispose };
}
