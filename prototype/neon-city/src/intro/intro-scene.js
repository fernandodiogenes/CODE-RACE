import * as THREE from 'three';
import { ASSET_MANIFEST } from '../../assets/manifest.js';
import { loadSharedModel } from '../assets/shared-model-cache.js';

const SCREEN_WIDTH = 8.05;
const SCREEN_HEIGHT = 4.55;
const SCREEN_CENTER = new THREE.Vector3(0, 3.45, 0.385);
const WINDOW = {
  centerX: 6,
  centerY: 4.45,
  centerZ: -3.55,
  width: 4.5,
  height: 5.55
};

function createWindowRain(scene) {
  const dropCount = 180;
  const z = WINDOW.centerZ + 0.015;
  const positions = new Float32Array(dropCount * 3);
  const velocities = [];
  const rainXMin = WINDOW.centerX - WINDOW.width / 2 + 0.12;
  const rainXMax = WINDOW.centerX + WINDOW.width / 2 - 0.12;
  const rainYMin = WINDOW.centerY - WINDOW.height / 2 + 0.14;
  const rainYMax = WINDOW.centerY + WINDOW.height / 2 - 0.14;

  for (let i = 0; i < dropCount; i += 1) {
    const offset = i * 3;
    positions[offset] = rainXMin + Math.random() * (rainXMax - rainXMin);
    positions[offset + 1] = rainYMin + Math.random() * (rainYMax - rainYMin);
    positions[offset + 2] = z;
    velocities.push(3.8 + Math.random() * 2.4);
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.computeBoundingSphere();
  const rain = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xe1f7fa,
    size: 0.035,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false
  }));
  rain.name = 'animated-window-rain-points';
  scene.add(rain);

  return {
    update(delta) {
      const positions = positionAttribute.array;
      const step = Math.min(delta, 0.05);
      velocities.forEach((speed, index) => {
        const offset = index * 3;
        positions[offset] -= speed * step * 0.025;
        positions[offset + 1] -= speed * step;

        if (positions[offset + 1] < rainYMin) {
          positions[offset] = rainXMin + Math.random() * (rainXMax - rainXMin);
          positions[offset + 1] = rainYMax;
        }
      });
      positionAttribute.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      rain.material.dispose();
      scene.remove(rain);
    }
  };
}

function createWindow(scene) {
  const { centerX, centerY, centerZ, width, height } = WINDOW;
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x111a25,
    metalness: 0.65,
    roughness: 0.38
  });

  const outside = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: 0x071a28 })
  );
  outside.position.set(centerX, centerY, centerZ - 0.025);
  scene.add(outside);

  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x092633,
    transparent: true,
    opacity: 0.72
  });
  const skyline = [
    [-1.65, -0.85, 0.72, 3.55],
    [-0.82, -1.05, 0.8, 3.15],
    [0.05, -0.75, 0.68, 3.75],
    [0.88, -1.15, 0.9, 2.95],
    [1.68, -0.92, 0.72, 3.4]
  ];
  skyline.forEach(([x, y, buildingWidth, buildingHeight]) => {
    const building = new THREE.Mesh(
      new THREE.PlaneGeometry(buildingWidth, buildingHeight),
      glowMaterial
    );
    building.position.set(centerX + x, centerY + y, centerZ - 0.01);
    scene.add(building);
  });

  const lightWindowMaterial = new THREE.MeshBasicMaterial({
    color: 0x31bbc6,
    transparent: true,
    opacity: 0.22
  });
  for (let i = 0; i < 11; i += 1) {
    const light = new THREE.Mesh(
      new THREE.PlaneGeometry(0.1 + (i % 3) * 0.06, 0.13 + (i % 2) * 0.08),
      lightWindowMaterial
    );
    light.position.set(
      centerX - 1.7 + ((i * 29) % 37) / 37 * 3.4,
      centerY - 2.15 + ((i * 17) % 31) / 31 * 3.8,
      centerZ + 0.005
    );
    scene.add(light);
  }

  const frameBars = [
    { x: centerX - width / 2, y: centerY, w: 0.16, h: height },
    { x: centerX + width / 2, y: centerY, w: 0.16, h: height },
    { x: centerX, y: centerY - height / 2, w: width, h: 0.16 },
    { x: centerX, y: centerY + height / 2, w: width, h: 0.16 },
    { x: centerX, y: centerY, w: 0.12, h: height }
  ];
  frameBars.forEach(({ x, y, w, h }) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.18), frameMaterial);
    bar.position.set(x, y, centerZ + 0.08);
    scene.add(bar);
  });

  createWindowRain(scene);
}

function createMonitor(scene) {
  const monitor = new THREE.Group();
  monitor.name = 'intro-crt-monitor';
  monitor.position.set(0, 0, -0.25);
  monitor.scale.setScalar(0.9);
  monitor.rotation.y = 0.105;
  scene.add(monitor);

  const shellMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b3a40,
    metalness: 0.38,
    roughness: 0.48
  });
  const rearMaterial = new THREE.MeshStandardMaterial({
    color: 0x1c282d,
    metalness: 0.3,
    roughness: 0.6
  });
  const bezelMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a4b50,
    metalness: 0.55,
    roughness: 0.38
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x1d2b30,
    metalness: 0.7,
    roughness: 0.3
  });

  const rearShell = new THREE.Mesh(
    new THREE.BoxGeometry(8.8, 5.45, 0.75),
    rearMaterial
  );
  rearShell.position.set(0, 3.5, -0.85);
  monitor.add(rearShell);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(9.15, 5.78, 1.35),
    shellMaterial
  );
  body.position.set(0, 3.5, -0.475);
  monitor.add(body);

  const screenMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x8daeba,
    emissive: 0x7ca9b8,
    emissiveIntensity: 1.05,
    metalness: 0.04,
    roughness: 0.82,
    clearcoat: 0.08,
    clearcoatRoughness: 0.92
  });
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(SCREEN_WIDTH, SCREEN_HEIGHT, 0.035),
    screenMaterial
  );
  glass.position.copy(SCREEN_CENTER);
  monitor.add(glass);

  const glassReflection = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN_WIDTH - 0.08, SCREEN_HEIGHT - 0.08),
    new THREE.MeshBasicMaterial({
      color: 0x8ceaf0,
      transparent: true,
      opacity: 0.035,
      depthWrite: false
    })
  );
  glassReflection.position.set(SCREEN_CENTER.x, SCREEN_CENTER.y, SCREEN_CENTER.z + 0.022);
  monitor.add(glassReflection);

  const frameDepth = 0.16;
  const frameZ = 0.46;
  const topBottomHeight = (5.68 - SCREEN_HEIGHT) / 2;
  const sideWidth = (9.05 - SCREEN_WIDTH) / 2;
  const bezelBars = [
    { x: 0, y: 3.5 - SCREEN_HEIGHT / 2 - topBottomHeight / 2, w: 9.05, h: topBottomHeight },
    { x: 0, y: 3.5 + SCREEN_HEIGHT / 2 + topBottomHeight / 2, w: 9.05, h: topBottomHeight },
    { x: -SCREEN_WIDTH / 2 - sideWidth / 2, y: 3.5, w: sideWidth, h: SCREEN_HEIGHT },
    { x: SCREEN_WIDTH / 2 + sideWidth / 2, y: 3.5, w: sideWidth, h: SCREEN_HEIGHT }
  ];
  bezelBars.forEach(({ x, y, w, h }) => {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, frameDepth),
      trimMaterial
    );
    bar.position.set(x, y, frameZ);
    monitor.add(bar);
  });

  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.035, 0.018),
    new THREE.MeshBasicMaterial({ color: 0x39c6c5 })
  );
  badge.position.set(0, 0.82, 0.625);
  monitor.add(badge);

  const neck = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.95, 0.78),
    shellMaterial
  );
  neck.position.set(0, 0.57, -0.05);
  monitor.add(neck);

  const foot = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.18, 1.45),
    bezelMaterial
  );
  foot.position.set(0, 0.16, 0.1);
  monitor.add(foot);

  for (let i = 0; i < 5; i += 1) {
    const vent = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.025, 0.018),
      trimMaterial
    );
    vent.position.set(4.22, 1.65 + i * 0.13, 0.56);
    monitor.add(vent);
  }

  return monitor;
}

function createDesk(scene) {
  const deskMaterial = new THREE.MeshStandardMaterial({
    color: 0x263238,
    metalness: 0.24,
    roughness: 0.64
  });
  const edgeMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a494d,
    metalness: 0.55,
    roughness: 0.42
  });

  const tabletop = new THREE.Mesh(
    new THREE.BoxGeometry(15.5, 0.28, 6.4),
    deskMaterial
  );
  tabletop.position.set(0, 0.04, 0.55);
  scene.add(tabletop);

  const frontEdge = new THREE.Mesh(
    new THREE.BoxGeometry(15.55, 0.09, 0.12),
    edgeMaterial
  );
  frontEdge.position.set(0, -0.11, 3.72);
  scene.add(frontEdge);

  [-6.35, 6.35].forEach(x => {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 2.6, 0.22),
      deskMaterial
    );
    leg.position.set(x, -1.33, 0.75);
    scene.add(leg);
  });
}

function createRoom(scene) {
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 16),
    new THREE.MeshStandardMaterial({
      color: 0x080d15,
      metalness: 0.08,
      roughness: 0.96,
      side: THREE.DoubleSide
    })
  );
  wall.position.set(0, 5.4, -4.2);
  scene.add(wall);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 24),
    new THREE.MeshStandardMaterial({
      color: 0x090e13,
      metalness: 0.18,
      roughness: 0.8
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -2.65, 0);
  scene.add(floor);

  createWindow(scene);
}

function disposeScene(scene) {
  scene.traverse(object => {
    if (object.geometry) object.geometry.dispose();
    if (!object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    });
  });
}

export function createIntroScene(container, screenUi) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060a11);

  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 100);
  camera.position.set(2.4, 4.55, 12.8);
  camera.lookAt(0, 3.05, -0.45);
  const initialCameraPose = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone()
  };

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = 'intro-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);
  const previewScene = new THREE.Scene();
  const previewCamera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
  previewCamera.position.set(0, 1.75, 6.8);
  previewCamera.lookAt(0, 1.55, 0);
  previewScene.add(new THREE.HemisphereLight(0xd8f0f1, 0x374e58, 1.5));
  const previewKeyLight = new THREE.DirectionalLight(0xffffff, 2.1);
  previewKeyLight.position.set(-3, 5, 6);
  previewScene.add(previewKeyLight);

  scene.add(new THREE.HemisphereLight(0x8298a8, 0x10141a, 1.05));
  const keyLight = new THREE.DirectionalLight(0xa3d4dc, 2.1);
  keyLight.position.set(-4, 8, 9);
  scene.add(keyLight);

  const windowLight = new THREE.PointLight(0x20a4bd, 6, 12, 2);
  windowLight.position.set(6, 4.7, -2.8);
  scene.add(windowLight);

  const screenBounce = new THREE.PointLight(0x8feaff, 15, 4.6, 2);
  screenBounce.position.set(0, 1.55, 0.9);
  scene.add(screenBounce);

  createRoom(scene);
  createDesk(scene);
  const monitor = createMonitor(scene);
  monitor.updateMatrixWorld(true);
  let previewPawn = null;
  let previewHead = null;
  let previewGeneration = 0;
  let previewGeometry = null;
  let previewMaterials = [];
  let previewViewport = null;
  let cameraTween = null;
  let savedCameraPose = null;
  let cameraTweenResolve = null;
  function disposePreviewHead() {
    if (!previewHead) return;
    previewHead.traverse(object => {
      if (!object.isMesh) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => material.dispose());
    });
    previewPawn?.remove(previewHead);
    previewHead = null;
  }

  const screenCorners = [
    new THREE.Vector3(-SCREEN_WIDTH * 0.46, SCREEN_CENTER.y + SCREEN_HEIGHT * 0.44, SCREEN_CENTER.z + 0.04),
    new THREE.Vector3(SCREEN_WIDTH * 0.46, SCREEN_CENTER.y + SCREEN_HEIGHT * 0.44, SCREEN_CENTER.z + 0.04),
    new THREE.Vector3(SCREEN_WIDTH * 0.46, SCREEN_CENTER.y - SCREEN_HEIGHT * 0.44, SCREEN_CENTER.z + 0.04),
    new THREE.Vector3(-SCREEN_WIDTH * 0.46, SCREEN_CENTER.y - SCREEN_HEIGHT * 0.44, SCREEN_CENTER.z + 0.04)
  ];
  const rain = createWindowRain(scene);
  function updateScreenUiProjection(width, height) {
    camera.updateMatrixWorld(true);
    monitor.updateMatrixWorld(true);
    const target = screenCorners.map(localCorner => {
      const projected = monitor.localToWorld(localCorner.clone()).project(camera);
      return [(projected.x * 0.5 + 0.5) * width, (-projected.y * 0.5 + 0.5) * height];
    });
    const sourceWidth = Math.hypot(target[1][0] - target[0][0], target[1][1] - target[0][1]);
    const sourceHeight = Math.hypot(target[3][0] - target[0][0], target[3][1] - target[0][1]);
    const homography = solveHomography(sourceWidth, sourceHeight, target);
    if (!homography) return;
    const [a, b, c, d, e, f, g, h] = homography;
    screenUi.style.width = `${sourceWidth}px`;
    screenUi.style.height = `${sourceHeight}px`;
    screenUi.style.transform = `matrix3d(${a},${d},0,${g},${b},${e},0,${h},0,0,1,0,${c},${f},0,1)`;
  }

  async function showPawnPreview({ character, color, viewport }) {
    const definition = ASSET_MANIFEST.characters[character];
    if (!definition) throw new Error('Personagem inválido para o preview.');
    previewViewport = viewport;
    if (!previewPawn) {
      previewGeometry = {
        base: new THREE.CylinderGeometry(0.82, 0.88, 0.16, 8),
        body: new THREE.ConeGeometry(0.58, 1.45, 6)
      };
      previewMaterials = [
        new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.55 }),
        new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.6 })
      ];
      previewPawn = new THREE.Group();
      previewPawn.scale.setScalar(0.9);
      const base = new THREE.Mesh(previewGeometry.base, previewMaterials[0]);
      const body = new THREE.Mesh(previewGeometry.body, previewMaterials[1]);
      base.position.y = 0.08;
      body.position.y = 0.78;
      previewPawn.add(base, body);
      previewScene.add(previewPawn);
    }
    previewMaterials.forEach(material => material.color.set(color));
    previewViewport = viewport;
    const generation = ++previewGeneration;
    const url = new URL(`../../assets/${definition.model}`, import.meta.url).href;
    const model = await loadSharedModel(url, new THREE.LoadingManager());
    if (generation !== previewGeneration || !previewPawn) return;
    if (!model) throw new Error(`Não foi possível carregar o personagem ${character}.`);
    disposePreviewHead();
    previewHead = model.clone(true);
    previewHead.traverse(object => {
      if (!object.isMesh) return;
      object.geometry = object.geometry.clone();
      object.material = Array.isArray(object.material)
        ? object.material.map(material => material.clone())
        : object.material.clone();
    });
    const characterScale = character === 'mulherpunk' ? 0.75 : 1;
    previewHead.scale.multiplyScalar((definition.scale ?? 1) * characterScale);
    previewHead.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(previewHead);
    const headScale = character === 'billy' ? 1.3 : ['cage', 'jaden'].includes(character) ? 1.15 : ['spencer', 'bubbleguy'].includes(character) ? 1.7 : 2;
    previewHead.scale.multiplyScalar(headScale);
    const baseline = character === 'jaden'
      ? 1.33
      : ['billy', 'cage'].includes(character)
        ? 1.38
        : character === 'spencer' ? 1.35
      : character === 'littlegirl' || character === 'mulherpunk' ? 0.82 : 1.48;
    previewHead.position.y = baseline - bounds.min.y * headScale;
    if (character === 'littlegirl' || character === 'mulherpunk') {
      previewHead.position.x = -0.15;
    }
    previewPawn.add(previewHead);
  }

  function updatePawnPreviewColor(color) {
    previewMaterials.forEach(material => material.color.set(color));
  }

  function disposePawnPreview() {
    previewGeneration += 1;
    if (!previewPawn) return;
    previewScene.remove(previewPawn);
    disposePreviewHead();
    previewPawn = null;
    previewViewport = null;
    Object.values(previewGeometry).forEach(geometry => geometry.dispose());
    previewMaterials.forEach(material => material.dispose());
    previewGeometry = null;
    previewMaterials = [];
  }

  function tweenCamera(position, quaternion, duration = 1050, result) {
    return new Promise(resolve => {
      cameraTween = {
        startPosition: camera.position.clone(),
        startQuaternion: camera.quaternion.clone(),
        targetPosition: position.clone(),
        targetQuaternion: quaternion.clone(),
        startedAt: performance.now(),
        duration,
        result
      };
      cameraTweenResolve = resolve;
    });
  }

  function tweenCameraToward(position, lookAt, duration) {
    const previousPosition = camera.position.clone();
    const previousQuaternion = camera.quaternion.clone();
    camera.position.copy(position);
    camera.lookAt(lookAt);
    const targetQuaternion = camera.quaternion.clone();
    camera.position.copy(previousPosition);
    camera.quaternion.copy(previousQuaternion);
    return tweenCamera(position, targetQuaternion, duration);
  }

  function zoomToScreen() {
    if (cameraTween) return Promise.reject(new Error('A câmera já está em transição.'));
    savedCameraPose = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone()
    };
    const screenCenter = monitor.localToWorld(
      new THREE.Vector3(SCREEN_CENTER.x, SCREEN_CENTER.y, SCREEN_CENTER.z + 0.055)
    );
    const screenNormal = new THREE.Vector3(0, 0, 1).transformDirection(monitor.matrixWorld);
    const distance = (SCREEN_HEIGHT * monitor.scale.y) /
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 0.88);
    const targetPosition = screenCenter.clone().addScaledVector(screenNormal, distance);
    const horizontalFov = 2 * Math.atan(
      Math.tan(THREE.MathUtils.degToRad(37) / 2) * 1.6
    );
    const targetWidth = SCREEN_WIDTH * monitor.scale.x * container.clientWidth /
      (2 * distance * Math.tan(horizontalFov / 2));
    const zoomScale = THREE.MathUtils.clamp(
      targetWidth / Math.max(1, screenUi.clientWidth),
      1,
      3.5
    );
    return tweenCameraToward(targetPosition, screenCenter, 1050).then(() => zoomScale);
  }

  function returnFromScreenZoom() {
    if (!savedCameraPose) return Promise.resolve();
    if (cameraTween) return Promise.reject(new Error('A câmera já está em transição.'));
    const target = savedCameraPose;
    return tweenCamera(target.position, target.quaternion).then(() => {
      camera.position.copy(target.position);
      camera.quaternion.copy(target.quaternion);
      savedCameraPose = null;
      camera.updateMatrixWorld(true);
    });
  }

  async function exitThroughWindow() {
    if (cameraTween) throw new Error('A câmera já está em transição.');
    const windowCenter = new THREE.Vector3(
      WINDOW.centerX,
      WINDOW.centerY,
      WINDOW.centerZ
    );
    const approach = new THREE.Vector3(
      WINDOW.centerX,
      WINDOW.centerY,
      WINDOW.centerZ + 1.35
    );
    const exterior = new THREE.Vector3(
      WINDOW.centerX,
      WINDOW.centerY,
      WINDOW.centerZ - 4.2
    );
    await tweenCameraToward(approach, windowCenter, 1650);
    await tweenCameraToward(
      exterior,
      exterior.clone().add(new THREE.Vector3(0, 0, -6)),
      1250
    );
  }

  function returnToIntroView() {
    if (cameraTween) return Promise.reject(new Error('A câmera já está em transição.'));
    savedCameraPose = null;
    return tweenCamera(
      initialCameraPose.position,
      initialCameraPose.quaternion,
      1050
    );
  }

  function updateCameraTween(now) {
    if (!cameraTween) return false;
    const progress = Math.min(1, (now - cameraTween.startedAt) / cameraTween.duration);
    const eased = progress * progress * (3 - 2 * progress);
    camera.position.lerpVectors(cameraTween.startPosition, cameraTween.targetPosition, eased);
    camera.quaternion.slerpQuaternions(
      cameraTween.startQuaternion,
      cameraTween.targetQuaternion,
      eased
    );
    camera.updateMatrixWorld(true);
    if (progress === 1) {
      camera.position.copy(cameraTween.targetPosition);
      camera.quaternion.copy(cameraTween.targetQuaternion);
      const result = cameraTween.result;
      cameraTween = null;
      cameraTweenResolve?.(result);
      cameraTweenResolve = null;
    }
    return true;
  }

  function renderPawnPreview() {
    if (!previewPawn || !previewViewport || previewViewport.hidden) return;
    const canvasBounds = renderer.domElement.getBoundingClientRect();
    const previewBounds = previewViewport.getBoundingClientRect();
    const left = Math.max(canvasBounds.left, previewBounds.left);
    const right = Math.min(canvasBounds.right, previewBounds.right);
    const top = Math.max(canvasBounds.top, previewBounds.top);
    const bottom = Math.min(canvasBounds.bottom, previewBounds.bottom);
    if (right <= left || bottom <= top) return;

    const x = left - canvasBounds.left;
    const y = canvasBounds.bottom - bottom;
    const width = right - left;
    const height = bottom - top;
    previewCamera.aspect = width / height;
    previewCamera.updateProjectionMatrix();
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.setScissorTest(true);
    renderer.setViewport(x, y, width, height);
    renderer.setScissor(x, y, width, height);
    renderer.render(previewScene, previewCamera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, canvasBounds.width, canvasBounds.height);
    renderer.autoClear = true;
  }

  function solveHomography(sourceWidth, sourceHeight, target) {
    const source = [
      [0, 0], [sourceWidth, 0], [sourceWidth, sourceHeight], [0, sourceHeight]
    ];
    const matrix = [];
    source.forEach(([x, y], index) => {
      const [targetX, targetY] = target[index];
      matrix.push([x, y, 1, 0, 0, 0, -targetX * x, -targetX * y, targetX]);
      matrix.push([0, 0, 0, x, y, 1, -targetY * x, -targetY * y, targetY]);
    });

    for (let column = 0; column < 8; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < 8; row += 1) {
        if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
      }
      [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
      const divisor = matrix[column][column];
      if (Math.abs(divisor) < 1e-10) return null;
      for (let entry = column; entry < 9; entry += 1) matrix[column][entry] /= divisor;
      for (let row = 0; row < 8; row += 1) {
        if (row === column) continue;
        const factor = matrix[row][column];
        for (let entry = column; entry < 9; entry += 1) {
          matrix[row][entry] -= factor * matrix[column][entry];
        }
      }
    }
    return matrix.map(row => row[8]);
  }

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    camera.aspect = width / height;
    const horizontalFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(37) / 2) * 1.6);
    camera.fov = THREE.MathUtils.radToDeg(
      2 * Math.atan(Math.tan(horizontalFov / 2) / camera.aspect)
    );
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    updateScreenUiProjection(width, height);
    renderer.render(scene, camera);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  let animationFrame = 0;
  let previousTime = 0;
  function animate(now) {
    animationFrame = requestAnimationFrame(animate);
    const delta = previousTime ? (now - previousTime) / 1000 : 0;
    previousTime = now;
    rain.update(delta);
    if (previewPawn) previewPawn.rotation.y += delta * 0.7;
    if (updateCameraTween(now)) {
      updateScreenUiProjection(container.clientWidth, container.clientHeight);
    }
    renderer.render(scene, camera);
    renderPawnPreview();
  }
  animationFrame = requestAnimationFrame(animate);

  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      cameraTweenResolve?.();
      cameraTweenResolve = null;
      cameraTween = null;
      disposePawnPreview();
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      rain.dispose();
      disposeScene(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
    showPawnPreview,
    updatePawnPreviewColor,
    disposePawnPreview,
    zoomToScreen,
    returnFromScreenZoom,
    exitThroughWindow,
    returnToIntroView
  };
}
