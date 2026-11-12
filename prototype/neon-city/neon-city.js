import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ASSET_MANIFEST } from './assets/manifest.js';
import { AssetLibrary } from './src/assets/asset-library.js';
import { DISTRICTS, CITY_ASSETS, districtIndexAt, collectAssetRefs } from './src/districts/district-config.js';
import { createBuildingComposer } from './src/buildings/building-composer.js';
import { createBlackMarketLandmark } from './src/buildings/black-market-landmark.js';
import { createRadioTowerLandmark, createBladeTowerLandmark, createHologramTowerLandmark, createStayedBridge } from './src/buildings/city-landmarks.js';
import { createGameState, team, rollDice, settleDice, beginMovement, advanceMovement, completeMovement, beginFinalizing, moveToHouse, resolveHouse, activateEvent, finishTurn, resolveFrozenEscape, resolveVirusInjectionEscape, resolveFinalChallenge, finishFinalWindow, activatePendingFinalGate, EVENT_LABELS } from './src/gameplay/game-state.js';
import { evaluateAnswer, getQuestionBank, registerQuestionUse, selectQuestion, setQuestionBank } from './src/gameplay/question-engine.js';
import { loadQuestionBank, normalizeQuestionDifficulty } from './src/gameplay/question-bank-loader.js';
import { getHouse, resolveDeferredRandomOutcome, resolveInteraction } from './src/gameplay/house-engine.js';
import {
  getChoiceDisplayName,
  getHouseDisplayName,
  getHouseExplanation,
  getInteractionDisplayName,
  isNeutralHouse
} from './src/ui/house-explanations.js';
import {
  activateGlobalEvent as activateGlobalEventAction, addTeamToActiveEvent, applyMovement, applyStatus, beginIntercept, canOverrideAction, canUseHack, getInterceptTargets,
  canUseShield, getAdversaries, getHackCount, getHackTypeCount, grantHack, grantRandomHack, hasHack, isGangProtectedByFirewall, isPenaltyCancelable, isProtectedByFirewall, removeStatus, resolveDoubleDice, resolveIntercept, resolveShield, setHackCount, swapWithTeamAhead, useOverride, useTurbo, moveTeam,
  beginMultiplayerInteraction, recordInteractionResponse, getInteractionResponses, getInteractionOrder,
  getQuestionMovementBonus, removeTeamFromActiveEvent, returnTeamToTurnStart
} from './src/gameplay/gameplay-actions.js';

const sceneRoot = document.querySelector('#scene');
const statusMessage = document.querySelector('#status-message');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1930);
// Névoa fria discreta — dá profundidade ao skyline sem esconder a cidade (raio efetivo ~280u).
scene.fog = new THREE.FogExp2(0x10243c, 0.0030);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 420);
camera.position.set(76, 72, 92);
scene.add(camera);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.38;
sceneRoot.appendChild(renderer.domElement);

// PÓS-PROCESSAMENTO — bloom seletivo por luminância (UnrealBloomPass já é threshold-based: só
// pixels acima de `threshold` estouram; os toneMapped:false * multiplicadores >1 dos materiais
// neon/outdoor produzem esses valores altos, prédios escuros ficam abaixo do threshold e não brilham).
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// Resolução do bloom em metade do tamanho da tela — halo suave, custo de blur bem mais barato
// (o efeito não precisa de detalhe fino, é um glow largo).
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.55, 0.35, 1.05);
bloomPass.threshold = 1.05;
bloomPass.strength = 0.55;
bloomPass.radius = 0.42;
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const city = new THREE.Group();
scene.add(city);
const clock = new THREE.Clock();
const dataStreams = [];
const windows = [];
const particles = [];
const glitchBars = [];
const rainLayers = [];
const animatedVehicles = [];
const animatedDrones = [];
const hologramSpinners = [];
const facadeLights = [];
const cityLights = [];
const buildingOccluders = [];
const occluderMeshes = [];
const board = new THREE.Group();
city.add(board);
board.position.y = 0.75;
const houses = [];
const pieces = [];
const cameraState = { mode: 'MAP', houseId: 30, progress: 1, focusPosition: new THREE.Vector3(), focusTarget: new THREE.Vector3(), focusOccluders: new Set() };
const mouse = new THREE.Vector2();
const targetCamera = new THREE.Vector3();
const targetLookAt = new THREE.Vector3();
const initialBootstrap = globalThis.CODE_RACE_BOOTSTRAP;
const initialTeams = initialBootstrap?.initialTeams;
const initialQuestionDifficulty = normalizeQuestionDifficulty(initialBootstrap?.questionDifficulty);
const configuredInitialTeams = initialTeams?.map(item => ({ ...item, members: [...item.members] })) ?? null;
delete globalThis.CODE_RACE_BOOTSTRAP;
const gameState = createGameState(initialTeams, initialQuestionDifficulty);
const portraitFiles = {
  bubbleguy: 'bubbleguyportrait.jpeg',
  cauboi: 'cauboiportrait.jpeg',
  littlegirl: 'littlegirlportrait.jpeg',
  mulherpunk: 'mulherpunkportrait.png',
  robot: 'robotportrait.png',
  billy: 'billyportrait.png',
  cage: 'cageportrait.png',
  jaden: 'jadenportrait.png',
  spencer: 'spencerportrait.png'
};
const professorEvents = [
  { id: 'NETWORK_OVERLOAD', name: 'SOBRECARGA DA REDE', description: 'Durante a próxima rodada completa, toda resposta correta que normalmente produzir uma recompensa de movimento recebe +1 casa adicional.' },
  { id: 'BLACKOUT', name: 'APAGÃO', description: 'Durante a próxima rodada completa, nenhuma equipe pode utilizar HACKS.' },
  { id: 'NETWORK_TURBO', name: 'TURBO DE REDE', description: 'Durante a próxima rodada completa, cada equipe recebe +1 no próximo lançamento de dado.' },
  { id: 'GLOBAL_VIRUS', name: 'VÍRUS GLOBAL', description: 'Durante a próxima rodada completa, qualquer equipe que errar uma pergunta recua 3 casas. Timeout também conta como erro. ESCUDO pode cancelar essa penalidade.' }
];
const pawnCharacterRecords = new Map();
const pawnPortraits = new Map();
const housePortraits = new Map();
const pawnTemplates = new Map();
let diceMove = null;
let diceRoll = null;
let activeDoubleDiceVisual = null;
let pendingQuestionConsequence = null;
let pendingRandomResolution = null;
let randomRouletteTimeoutId = null;
let pendingDoubleDiceRoll = null;
let presentedGlobalEventId = null;
let globalEventDismissedId = null;
let globalEventPulseTimeoutId = null;
let victorySceneState = null;
const DICE_ROLL_DURATION = 2.55;
const DICE_PIP_LAYOUT = [
  [4],
  [2, 6],
  [2, 4, 6],
  [0, 2, 6, 8],
  [0, 2, 4, 6, 8],
  [0, 2, 3, 5, 6, 8]
];
const diceForegroundScene = new THREE.Scene();
const diceForegroundCamera = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far);
const diceForegroundCameraPosition = new THREE.Vector3();
const diceForegroundCameraQuaternion = new THREE.Quaternion();
const diceStage = new THREE.Group();
const diceCube = new THREE.Mesh(
  new THREE.BoxGeometry(0.68, 0.68, 0.68),
  Array.from({ length: 6 }, (_, index) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    context.fillStyle = '#55b9b6';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const pipPositions = DICE_PIP_LAYOUT[index];
    context.fillStyle = '#f4fbff';
    pipPositions.forEach(position => {
      const x = 64 + (position % 3) * 64;
      const y = 64 + Math.floor(position / 3) * 64;
      context.beginPath();
      context.arc(x, y, 18, 0, Math.PI * 2);
      context.fill();
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return new THREE.MeshStandardMaterial({
      map: texture,
      emissive: 0x123b39,
      emissiveIntensity: 0.16,
      roughness: 0.52,
      metalness: 0.06,
      depthTest: false,
      depthWrite: false
    });
  })
);
diceCube.renderOrder = 2002;
diceForegroundScene.add(diceForegroundCamera);
diceForegroundCamera.add(diceStage);
diceStage.visible = true;
diceStage.add(diceCube);
diceCube.visible = false;
const dicePlatform = new THREE.Mesh(
  new THREE.BoxGeometry(1.55, 0.14, 1.15),
  new THREE.MeshStandardMaterial({ color: 0x081522, roughness: 0.48, metalness: 0.5, depthTest: false, depthWrite: false })
);
dicePlatform.position.y = -0.12;
dicePlatform.renderOrder = 2000;
dicePlatform.visible = true;
diceStage.add(dicePlatform);
const diceEdge = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.57, 0.16, 1.17)),
  new THREE.LineBasicMaterial({ color: 0x256b70, depthTest: false, depthWrite: false })
);
diceEdge.position.copy(dicePlatform.position);
diceEdge.renderOrder = 2001;
diceEdge.visible = true;
diceStage.add(diceEdge);
const diceFillLight = new THREE.PointLight(0x4ee6e4, 2.2, 4, 2);
diceFillLight.position.set(0.35, 1.1, 1.4);
diceStage.add(diceFillLight);
const diceRestY = 0.29;
positionDiceStage();

const mapOrbit = {
  target: new THREE.Vector3(0, 7, 0),
  azimuth: Math.atan2(92, 76),
  polar: Math.acos(72 / Math.hypot(76, 72, 92)),
  distance: Math.hypot(76, 72, 92),
  targetAzimuth: Math.atan2(92, 76),
  targetPolar: Math.acos(72 / Math.hypot(76, 72, 92)),
  targetDistance: Math.hypot(76, 72, 92),
  minDistance: 28,
  maxDistance: 150,
  minPolar: 0.32,
  maxPolar: 1.45
};
const savedMapOrbit = { azimuth: mapOrbit.azimuth, polar: mapOrbit.polar, distance: mapOrbit.distance };
let isDragging = false;
let lastPointerX = 0;
let lastPointerY = 0;
const cameraAnchor = new THREE.Vector3();
const pieceWorldPosition = new THREE.Vector3();
const focusFollowDelta = new THREE.Vector3();
const houseWorldPosition = new THREE.Vector3();
const occlusionDirection = new THREE.Vector3();
const occlusionRaycaster = new THREE.Raycaster();
const focusCandidates = [
  new THREE.Vector3(15, 8, 16),
  new THREE.Vector3(-15, 8, 16),
  new THREE.Vector3(16, 7, -15),
  new THREE.Vector3(-16, 7, -15),
  new THREE.Vector3(10, 11, 20),
  new THREE.Vector3(-10, 11, 20)
];
const focusProbeOffsets = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(3.2, 0, 0),
  new THREE.Vector3(-3.2, 0, 0),
  new THREE.Vector3(0, 0, 3.2),
  new THREE.Vector3(0, 0, -3.2),
  new THREE.Vector3(2.25, 0, 2.25),
  new THREE.Vector3(-2.25, 0, 2.25),
  new THREE.Vector3(2.25, 0, -2.25),
  new THREE.Vector3(-2.25, 0, -2.25),
  new THREE.Vector3(0, 1.8, 0),
  new THREE.Vector3(0, -0.4, 0),
  new THREE.Vector3(2.5, 1.1, 0),
  new THREE.Vector3(-2.5, 1.1, 0),
  new THREE.Vector3(0, 1.1, 2.5),
  new THREE.Vector3(0, 1.1, -2.5)
];
const focusCandidatePosition = new THREE.Vector3();
const focusCandidateTarget = new THREE.Vector3();
const focusProbeDirection = new THREE.Vector3();
let lastOcclusionCheck = 0;
let visibilityDirty = true;
let targetFov = 42;
let lastLodUpdate = 0;
const messages = [
  'REDE ATIVA // DADOS SINCRONIZADOS',
  'SETOR 07 // PACOTES EM ROTA',
  'ECO DE SINAL // RASTRO INDEFINIDO',
  'LINK NEXUS // BAIXA VISIBILIDADE'
];
let lastMessage = 0;

const materials = {
  road: new THREE.MeshBasicMaterial({ color: 0x142130 }),
  block: new THREE.MeshStandardMaterial({ color: 0x172438, roughness: 0.92, metalness: 0.18 }),
  roof: new THREE.MeshBasicMaterial({ color: 0x294056 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x344356, roughness: 0.94, metalness: 0.08 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x263546, roughness: 0.68, metalness: 0.72 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x245267, roughness: 0.22, metalness: 0.58, transparent: true, opacity: 0.82 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x684840, roughness: 0.98, metalness: 0.18 }),
  panel: new THREE.MeshBasicMaterial({ color: 0x31485b, transparent: true, opacity: 0.72 }),
  cyan: new THREE.MeshBasicMaterial({ color: 0x4ee6e4, transparent: true, opacity: 0.64 }),
  amber: new THREE.MeshBasicMaterial({ color: 0xe6a85e, transparent: true, opacity: 0.72 }),
  red: new THREE.MeshBasicMaterial({ color: 0xf04f62, transparent: true, opacity: 0.78 }),
  purple: new THREE.MeshBasicMaterial({ color: 0xb36cff, transparent: true, opacity: 0.72 }),
  green: new THREE.MeshBasicMaterial({ color: 0x8edb79, transparent: true, opacity: 0.68 }),
  data: new THREE.MeshBasicMaterial({ color: 0xbdeff2 }),
  rain: new THREE.PointsMaterial({ color: 0x83cdd0, size: 0.18, transparent: true, opacity: 0.2, depthWrite: false })
};
const sharedGeometry = {
  window: new THREE.PlaneGeometry(0.52, 0.78),
  narrowWindow: new THREE.PlaneGeometry(0.28, 0.62),
  panel: new THREE.BoxGeometry(1.2, 0.7, 0.06),
  awning: new THREE.BoxGeometry(2.4, 0.12, 0.8),
  vent: new THREE.BoxGeometry(0.56, 0.42, 0.18),
  pipe: new THREE.CylinderGeometry(0.07, 0.07, 3.8, 5),
  cable: new THREE.CylinderGeometry(0.035, 0.035, 1, 4),
  vehicle: new THREE.BoxGeometry(1.5, 0.32, 0.72),
  drone: new THREE.OctahedronGeometry(0.42, 0)
};
const houseGlowTexture = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.18, 'rgba(78,230,228,0.5)');
  gradient.addColorStop(1, 'rgba(78,230,228,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
})();
const sectorStyles = DISTRICTS.map(district => ({ name: district.name, color: district.palette.primary, atmosphere: district.palette.atmosphere }));
const houseBeaconCoreGeometry = new THREE.OctahedronGeometry(0.34, 0);
const houseBeaconHaloTexture = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.12, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.16)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.05)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
})();

function beaconLabelTexture(number, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 72;
  const context = canvas.getContext('2d');
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  context.fillStyle = 'rgba(4,8,14,0.92)';
  context.beginPath();
  context.roundRect(2, 2, 124, 68, 14);
  context.fill();
  context.lineWidth = 5;
  context.strokeStyle = hex;
  context.stroke();
  context.fillStyle = '#ffffff';
  context.font = 'bold 44px monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(number).padStart(2, '0'), 64, 39);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
// Alturas calibradas para a distribuição global ~45% baixos / 40% médios / 15% altos, com a
// cidade máxima (~34u, Central Nexus) e só 3-5 prédios no total passando de 80% dela (ver
// `verySpecialTallBudget` em addBuildings). Ocupação (density/openSpace/spacing) segue a
// morfologia por distrito da direção de arte: Zero aberto, Cyber Alley/Black Market densos,
// Neon District vertical, Nexus monumental com praça.
const CITY_MAX_HEIGHT = 34;
const urbanProfiles = [
  // District Zero — 40% ocupação, baixo/médio, vale no skyline, muito espaço aberto.
  { density: 0.4, buildingCount: 11, minHeight: 4, maxHeight: 11, footprintSize: [6.4, 10], spacing: 14.5, openSpace: 0.4, tallBuildingChance: 0.05, lowBuildingChance: 0.68, irregularity: 0.22 },
  // Cyber Alley — ~85% ocupação, becos estreitos, verticalidade forte, subpico.
  { density: 0.85, buildingCount: 21, minHeight: 10, maxHeight: 24, footprintSize: [3.8, 5.8], spacing: 7.6, openSpace: 0.06, tallBuildingChance: 0.32, lowBuildingChance: 0.1, irregularity: 0.5 },
  // Black Market — ~90% ocupação, baixo/médio, irregular, sem torres altas (só o pórtico landmark).
  { density: 0.9, buildingCount: 22, minHeight: 3, maxHeight: 11, footprintSize: [5, 10], spacing: 7, openSpace: 0.04, tallBuildingChance: 0.02, lowBuildingChance: 0.74, irregularity: 0.85 },
  // Neon District — ~70% ocupação, mais vertical, subpico.
  { density: 0.7, buildingCount: 17, minHeight: 11, maxHeight: 27, footprintSize: [6.5, 11], spacing: 9.5, openSpace: 0.16, tallBuildingChance: 0.34, lowBuildingChance: 0.12, irregularity: 0.3 },
  // Central Nexus — ~50% ocupação, praça aberta, poucas torres monumentais (pico absoluto).
  { density: 0.5, buildingCount: 12, minHeight: 12, maxHeight: CITY_MAX_HEIGHT * 0.7, footprintSize: [7.5, 12.5], spacing: 13, openSpace: 0.3, tallBuildingChance: 0.3, lowBuildingChance: 0.08, irregularity: 0.18 }
];
const morphologyTransitions = 8;

function blendProfile(first, second, amount) {
  const mix = THREE.MathUtils.smoothstep(amount, 0, 1);
  return {
    density: THREE.MathUtils.lerp(first.density, second.density, mix),
    buildingCount: Math.round(THREE.MathUtils.lerp(first.buildingCount, second.buildingCount, mix)),
    minHeight: THREE.MathUtils.lerp(first.minHeight, second.minHeight, mix),
    maxHeight: THREE.MathUtils.lerp(first.maxHeight, second.maxHeight, mix),
    footprintSize: [THREE.MathUtils.lerp(first.footprintSize[0], second.footprintSize[0], mix), THREE.MathUtils.lerp(first.footprintSize[1], second.footprintSize[1], mix)],
    spacing: THREE.MathUtils.lerp(first.spacing, second.spacing, mix),
    openSpace: THREE.MathUtils.lerp(first.openSpace, second.openSpace, mix),
    tallBuildingChance: THREE.MathUtils.lerp(first.tallBuildingChance, second.tallBuildingChance, mix),
    lowBuildingChance: THREE.MathUtils.lerp(first.lowBuildingChance, second.lowBuildingChance, mix),
    irregularity: THREE.MathUtils.lerp(first.irregularity, second.irregularity, mix)
  };
}

function morphologyAt(x) {
  const rawIndex = THREE.MathUtils.clamp((x + 60) / 24, 0, urbanProfiles.length - 1);
  const index = Math.floor(rawIndex);
  const fraction = rawIndex - index;
  if (index >= urbanProfiles.length - 1) return urbanProfiles[urbanProfiles.length - 1];
  if (fraction < morphologyTransitions / 24 && index > 0) return blendProfile(urbanProfiles[index - 1], urbanProfiles[index], fraction / (morphologyTransitions / 24));
  if (fraction > 1 - morphologyTransitions / 24) return blendProfile(urbanProfiles[index], urbanProfiles[index + 1], (fraction - (1 - morphologyTransitions / 24)) / (morphologyTransitions / 24));
  return urbanProfiles[index];
}

const assetLibrary = new AssetLibrary({
  renderer,
  manifest: ASSET_MANIFEST,
  baseUrl: new URL('./assets/', import.meta.url),
  onProgress: (loaded, total) => { statusMessage.textContent = `RECURSOS // ${loaded}/${total}`; }
});
const selectedQuestionBank = await loadQuestionBank(gameState.questionDifficulty);
setQuestionBank(selectedQuestionBank, gameState.questionDifficulty);
await assetLibrary.preload(collectAssetRefs());
const buildingComposer = createBuildingComposer({ assets: assetLibrary, materials, sharedGeometry, windows, facadeLights });

// Preenchimento suficiente para ler a cidade sem apagar o contraste noturno.
scene.add(new THREE.HemisphereLight(0x6388a0, 0x182638, 1.16));
const cityKeyLight = new THREE.DirectionalLight(0x91b3c8, 1.08);
cityKeyLight.position.set(-40, 70, 34);
scene.add(cityKeyLight);
const cityFillLight = new THREE.DirectionalLight(0x59758b, 0.82);
cityFillLight.position.set(76, 48, 92);
scene.add(cityFillLight);
const cyanLight = new THREE.PointLight(0x4ee6e4, 16, 72, 2.3);
cyanLight.position.set(-32, 9, -20);
scene.add(cyanLight);
const amberLight = new THREE.PointLight(0xe6a85e, 11, 54, 2.4);
amberLight.position.set(30, 7, 22);
scene.add(amberLight);
DISTRICTS.forEach(district => district.lighting.pointLights.forEach(({ color, intensity, distance, decay = 2, position }) => {
  const light = new THREE.PointLight(color, intensity, distance, decay);
  light.position.set(...position);
  scene.add(light);
}));

function box(width, height, depth, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  city.add(mesh);
  return mesh;
}

function registerBuildingOccluder(root) {
  const record = { root, meshes: [], lodMeshes: [], opacity: 1, targetOpacity: 1 };
  root.traverse(object => {
    if (!object.isMesh || !object.material) return;
    const material = object.material.clone();
    material.transparent = true;
    material.userData.baseOpacity = material.opacity == null ? 1 : material.opacity;
    object.material = material;
    object.userData.occluder = record;
    object.userData.lodLevel = object.userData.visualLod || 'medium';
    object.userData.lodFactor = object.userData.lodLevel === 'near' ? 0 : 1;
    object.userData.lodTarget = object.userData.lodFactor;
    record.meshes.push(object);
    record.lodMeshes.push(object);
    occluderMeshes.push(object);
  });
  buildingOccluders.push(record);
}

function updateBuildingLod(force = false) {
  if (!force && clock.elapsedTime - lastLodUpdate < 0.12) return;
  lastLodUpdate = clock.elapsedTime;
  const focusMode = cameraState.mode === 'FOCUS_HOUSE';
  buildingOccluders.forEach(record => {
    record.root.getWorldPosition(cameraAnchor);
    const distance = camera.position.distanceTo(cameraAnchor);
    const nearStart = focusMode ? 100 : 30;
    const nearEnd = focusMode ? 42 : 14;
    const mediumStart = focusMode ? 150 : 68;
    const mediumEnd = focusMode ? 88 : 38;
    const nearFactor = 1 - THREE.MathUtils.smoothstep(distance, nearEnd, nearStart);
    const mediumFactor = 1 - THREE.MathUtils.smoothstep(distance, mediumEnd, mediumStart);
    record.lodMeshes.forEach(mesh => {
      if (mesh.userData.lodLevel === 'near') mesh.userData.lodTarget = nearFactor;
      else if (mesh.userData.lodLevel === 'medium') mesh.userData.lodTarget = Math.max(0.52, mediumFactor);
      else mesh.userData.lodTarget = 1;
    });
  });
}

function restoreBuildingOpacity() {
  buildingOccluders.forEach(record => { record.targetOpacity = 1; });
}

function getFocusTarget(houseId, target = focusCandidateTarget) {
  const house = houses[houseId - 1];
  if (!house) return target.set(0, 0, 0);
  house.pad.getWorldPosition(target);
  const piece = pieces.find(item => item.targetHouseId === houseId);
  if (piece) target.y += 1.15;
  else target.y += 0.72;
  return target;
}

function countOccludersBetween(origin, target) {
  focusProbeDirection.subVectors(target, origin);
  const distance = focusProbeDirection.length();
  occlusionRaycaster.set(origin, focusProbeDirection.normalize());
  return occlusionRaycaster.intersectObjects(occluderMeshes, false).filter(hit => hit.distance < distance - 1.1);
}

function getFocusOccluders(origin, houseId, targetPosition = null) {
  if (targetPosition) focusCandidateTarget.copy(targetPosition);
  else getFocusTarget(houseId, focusCandidateTarget);
  const records = new Set();
  focusProbeOffsets.forEach(offset => {
    focusCandidateTarget.add(offset);
    countOccludersBetween(origin, focusCandidateTarget).forEach(hit => {
      const record = hit.object.userData.occluder;
      if (record) records.add(record);
    });
    focusCandidateTarget.sub(offset);
  });
  return records;
}

function getBestFocusCameraPosition(houseId) {
  getFocusTarget(houseId, focusCandidateTarget);
  let bestScore = Infinity;
  let bestHits = new Set();
  focusCandidates.forEach((offset, index) => {
    focusCandidatePosition.copy(focusCandidateTarget).add(offset);
    const hits = getFocusOccluders(focusCandidatePosition, houseId);
    const heightPenalty = Math.abs(offset.y - 8) * 0.2;
    const score = hits.size * 100 + heightPenalty + index * 0.01;
    if (score < bestScore) {
      bestScore = score;
      bestHits = hits;
      cameraState.focusPosition.copy(focusCandidatePosition);
    }
  });
  cameraState.focusTarget.copy(focusCandidateTarget);
  cameraState.focusOccluders = bestHits;
  return cameraState.focusPosition;
}

function setOccluderFade(houseId, enabled, origin = camera.position) {
  restoreBuildingOpacity();
  if (!enabled || !houses[houseId - 1]) return;
  const records = getFocusOccluders(origin, houseId, cameraState.focusTarget);
  records.forEach(record => { record.targetOpacity = Math.min(record.targetOpacity, 0.004); });
  cameraState.focusOccluders.forEach(record => { record.targetOpacity = Math.min(record.targetOpacity, 0.004); });
}

function updateHouseVisibility(force = false) {
  if (!force && cameraState.mode === 'FOCUS_HOUSE' && clock.elapsedTime - lastOcclusionCheck < 0.08) return;
  lastOcclusionCheck = clock.elapsedTime;
  visibilityDirty = false;
  if (cameraState.mode === 'FOCUS_HOUSE') {
    setOccluderFade(cameraState.houseId, true, camera.position);
    ensureHouseVisible(cameraState.houseId);
  }
  else restoreBuildingOpacity();
}

function ensureHouseVisible(houseId) {
  if (cameraState.mode !== 'FOCUS_HOUSE') return;
  getFocusOccluders(camera.position, houseId, cameraState.focusTarget).forEach(record => {
    record.targetOpacity = Math.min(record.targetOpacity, 0.002);
  });
}

function animateOccluderOpacity() {
  buildingOccluders.forEach(record => {
    record.opacity += (record.targetOpacity - record.opacity) * 0.2;
    record.meshes.forEach(mesh => {
      const material = mesh.material;
      const baseOpacity = material.userData.baseOpacity;
      mesh.userData.lodFactor += (mesh.userData.lodTarget - mesh.userData.lodFactor) * 0.12;
      material.opacity = baseOpacity * record.opacity * mesh.userData.lodFactor;
      material.depthWrite = record.opacity > 0.82 && mesh.userData.lodFactor > 0.82;
    });
  });
}

function animatedBuildingOpacity(mesh, baseOpacity) {
  const record = mesh.userData.occluder;
  if (!record) return baseOpacity;
  return baseOpacity * record.opacity * mesh.userData.lodFactor;
}

function addRoads() {
  const roadMaterial = new THREE.MeshBasicMaterial({ color: 0x101a28 });
  for (let i = -60; i <= 60; i += 15) {
    box(5.6, 0.12, 132, roadMaterial, i, -0.08, 0);
    box(132, 0.12, 5.6, roadMaterial, 0, -0.06, i);
    for (let j = -54; j <= 54; j += 15) {
      box(0.12, 0.025, 4.6, materials.roof, i, 0.02, j);
      box(4.6, 0.025, 0.12, materials.roof, j, 0.02, i);
    }
  }
  const grid = new THREE.GridHelper(132, 24, 0x31576a, 0x15293a);
  grid.position.y = 0.03;
  city.add(grid);
}

function addBuildings() {
  const placed = [];
  const districtCounts = [0, 0, 0, 0, 0];
  // Orçamento global de "prédios muito altos" (>80% da altura máxima da cidade) — a direção de
  // arte pede só 3 a 5 no total, senão a silhueta perde os poucos picos que a identificam.
  const veryTallThreshold = CITY_MAX_HEIGHT * 0.8;
  let veryTallBudget = 4;
  let lastHeightByDistrict = [null, null, null, null, null];
  for (let x = -52; x <= 52; x += 9) {
    for (let z = -52; z <= 52; z += 9) {
      const districtIndex = districtIndexAt(x);
      const profile = morphologyAt(x);
      const localDensity = profile.density * (1 - profile.openSpace * (Math.random() * 0.42));
      if (districtCounts[districtIndex] >= profile.buildingCount || Math.random() > localDensity) continue;
      const jitter = 2.2 + profile.irregularity * 3.2;
      const position = { x: x + (Math.random() - 0.5) * jitter, z: z + (Math.random() - 0.5) * jitter };
      if (placed.some(item => Math.hypot(item.x - position.x, item.z - position.z) < profile.spacing)) continue;
      const district = DISTRICTS[districtIndex];
      // Evita vizinhos com a mesma altura: se o último prédio do distrito ficou na metade de
      // cima da faixa, este é puxado para a metade de baixo, e vice-versa.
      const mid = (profile.minHeight + profile.maxHeight) / 2;
      const previousHeight = lastHeightByDistrict[districtIndex];
      let heightRange = [profile.minHeight, profile.maxHeight];
      if (previousHeight != null) {
        heightRange = previousHeight > mid ? [profile.minHeight, mid] : [mid, profile.maxHeight];
      }
      const canRollVeryTall = veryTallBudget > 0 && profile.tallBuildingChance > 0.25;
      const architecture = {
        ...district.architecture,
        footprint: profile.footprintSize,
        jitter: Math.max(0.35, profile.irregularity * 2.4),
        rotationJitter: district.architecture.rotationJitter,
        heightRange,
        tallChance: canRollVeryTall ? profile.tallBuildingChance : 0,
        tallMultiplier: 1.25,
        windowChance: district.architecture.windowChance * (0.72 + profile.density * 0.42),
        externalChance: district.architecture.externalChance * (0.78 + profile.irregularity * 0.32)
      };
      if (profile.lowBuildingChance > Math.random()) architecture.heightRange = [profile.minHeight, THREE.MathUtils.lerp(profile.minHeight, profile.maxHeight, 0.46)];
      const building = buildingComposer.compose({ ...district, architecture }, position.x, position.z);
      const builtHeight = building.userData.builtHeight ?? 0;
      if (builtHeight >= veryTallThreshold) veryTallBudget -= 1;
      lastHeightByDistrict[districtIndex] = builtHeight;
      city.add(building);
      registerBuildingOccluder(building);
      placed.push({ x: position.x, z: position.z, group: building, districtIndex, profile });
      districtCounts[districtIndex] += 1;
    }
  }
  buildingComposer.flush(city);
  addFixedBuildings();
  addDistrictInfrastructure(placed);
  addCentralNexusMonuments();
  addDistantSkyline();
  addBlackMarketLandmark(placed);
  addDistrictLandmarks(placed);
  addConnectorBridge();
  addPeripheralSilhouettes();
}

function addPeripheralSilhouettes() {
  const silhouettes = [
    [-92, -78, 8, 18, 8], [-70, -88, 10, 26, 9], [-38, -94, 9, 16, 8],
    [0, -98, 12, 24, 10], [42, -92, 9, 19, 8], [78, -84, 11, 28, 9],
    [96, -48, 8, 20, 10], [98, 8, 10, 25, 8], [92, 58, 9, 17, 10],
    [64, 94, 10, 23, 9], [22, 100, 12, 28, 10], [-28, 98, 9, 18, 8],
    [-74, 90, 10, 25, 9], [-98, 48, 8, 17, 9], [-100, -10, 10, 23, 8]
  ];
  const materials = [
    new THREE.MeshBasicMaterial({ color: 0x31475b, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: 0x253b50, transparent: true, opacity: 0.13, depthWrite: false, toneMapped: false })
  ];
  silhouettes.forEach(([x, z, width, height, depth], index) => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[index % materials.length]);
    body.position.y = height / 2;
    group.add(body);
    if (index % 3 !== 1) {
      const crownHeight = height * 0.24;
      const crown = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.66, crownHeight, depth * 0.72),
        materials[(index + 1) % materials.length]
      );
      crown.position.set(width * 0.08, height + crownHeight / 2, -depth * 0.06);
      group.add(crown);
    }
    group.position.set(x, 0, z);
    group.userData.peripheralBackdrop = true;
    city.add(group);
  });
}

// Complementos fixos: não participam do gerador existente nem consomem sua aleatoriedade.
function addFixedBuildings() {
  const fixed = [
    { x: -57, z: -54, width: 5.5, depth: 6.5, height: 9, color: 0x243545 },
    { x: 56, z: -53, width: 5.5, depth: 7, height: 15, color: 0x263c4b },
    { x: -57, z: 52, width: 6, depth: 7, height: 12, color: 0x342d38 },
    { x: 55, z: 52, width: 7, depth: 7, height: 20, color: 0x293d50 }
  ];
  fixed.forEach(({ x, z, width, depth, height, color }) => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.28 }));
    body.position.y = height / 2;
    group.add(body);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(width * 0.78, 0.14, depth * 0.78), materials.roof);
    roof.position.y = height + 0.07;
    group.add(roof);
    group.position.set(x, 0, z);
    group.userData.builtHeight = height;
    group.userData.fixedLayout = true;
    city.add(group);
    registerBuildingOccluder(group);
  });
}

// Landmarks reconhecíveis pela silhueta para District Zero, Cyber Alley e Neon District (Black
// Market e Central Nexus já têm o deles). Cada um procura, entre alguns pontos candidatos perto
// do centro do seu distrito, o primeiro que não colide com um prédio já colocado ali.
function addDistrictLandmarks(placed) {
  const findSpot = (districtIndex, candidates, minDistance = 9) =>
    candidates.find(candidate => !placed.some(item => item.districtIndex === districtIndex && Math.hypot(item.x - candidate.x, item.z - candidate.z) < minDistance)) ?? candidates[0];

  const zeroSpot = findSpot(0, [{ x: -48, z: -2 }, { x: -46, z: 6 }, { x: -50, z: 10 }]);
  const radioTower = createRadioTowerLandmark({ x: zeroSpot.x, z: zeroSpot.z });
  city.add(radioTower);
  registerBuildingOccluder(radioTower);

  const cyberSpot = findSpot(1, [{ x: -24, z: -4 }, { x: -22, z: 4 }, { x: -26, z: -8 }], 8);
  const bladeTower = createBladeTowerLandmark({ x: cyberSpot.x, z: cyberSpot.z, windows });
  city.add(bladeTower);
  registerBuildingOccluder(bladeTower);

  const neonSpot = findSpot(3, [{ x: 22, z: 18 }, { x: 26, z: 22 }, { x: 20, z: 26 }], 9);
  const hologramTower = createHologramTowerLandmark({ x: neonSpot.x, z: neonSpot.z });
  city.add(hologramTower);
  registerBuildingOccluder(hologramTower);
}

// Ponte estaiada branco/cyan conectando Cyber Alley e Black Market — o "vão entre distritos" da
// direção de arte (equivalente ao rio/ponte da referência de skyline denso).
function addConnectorBridge() {
  const bridge = createStayedBridge({ from: [-13, 0, -30], to: [-11, 0, -50] });
  city.add(bridge);
  registerBuildingOccluder(bridge);
}

// Prova de conceito: um único prédio 100% modelado com geometria nativa (sem textura de
// fachada), colocado no Black Market para comparar lado a lado com os prédios procedurais.
// Some com um vizinho próximo demais (evita sobreposição), mas não altera a morfologia do distrito.
function addBlackMarketLandmark(placed) {
  // Perto da casa 27 (x≈1, z≈38), bem visível a partir do FOCUS_HOUSE das casas 26-29.
  const candidates = [{ x: 4, z: 33 }, { x: -3, z: 40 }, { x: 6, z: 41 }, { x: 1, z: 30 }];
  const spot = candidates.find(candidate => !placed.some(item => item.districtIndex === 2 && Math.hypot(item.x - candidate.x, item.z - candidate.z) < 8)) ?? candidates[0];
  const landmark = createBlackMarketLandmark({ x: spot.x, z: spot.z, windows, facadeLights });
  city.add(landmark);
  registerBuildingOccluder(landmark);
}

function addDistrictInfrastructure(placed) {
  const bridgeGeometry = new THREE.BoxGeometry(1, 0.22, 2.2);
  const bridgeMaterial = new THREE.MeshStandardMaterial({ color: 0x26384a, roughness: 0.62, metalness: 0.72 });
  const cableMaterial = new THREE.LineBasicMaterial({ color: 0x7f65aa, transparent: true, opacity: 0.46 });
  const cyberBuildings = placed.filter(item => item.districtIndex === 1).sort((first, second) => first.x - second.x);
  for (let index = 0; index < cyberBuildings.length - 1; index += 2) {
    const first = cyberBuildings[index];
    const second = cyberBuildings[index + 1];
    if (Math.abs(first.z - second.z) > 18) continue;
    const bridge = new THREE.Mesh(bridgeGeometry, bridgeMaterial);
    bridge.position.set((first.x + second.x) / 2, 10 + (index % 3) * 4, (first.z + second.z) / 2);
    bridge.scale.x = Math.max(1, Math.hypot(first.x - second.x, first.z - second.z) / 2);
    bridge.rotation.y = Math.atan2(second.x - first.x, second.z - first.z);
    const connector = new THREE.Group();
    connector.add(bridge);
    city.add(connector);
    registerBuildingOccluder(connector);
    const points = [new THREE.Vector3(first.x, 13, first.z), new THREE.Vector3((first.x + second.x) / 2, 17, (first.z + second.z) / 2), new THREE.Vector3(second.x, 13, second.z)];
    city.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), cableMaterial));
  }
  const oldTechMaterial = new THREE.MeshStandardMaterial({ color: 0x4c5360, roughness: 0.9, metalness: 0.25 });
  placed.filter(item => item.districtIndex === 0).slice(0, 5).forEach(item => {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.8, 8), oldTechMaterial);
    tank.position.set(item.x + 4, 1.1, item.z + 3.8);
    city.add(tank);
  });
}

function addCentralNexusMonuments() {
  const nexusGroup = new THREE.Group();
  nexusGroup.position.set(47, 0, 8);
  const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x314b5d, roughness: 0.38, metalness: 0.78 });
  [-1, 1].forEach(side => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 24, 3.2), pillarMaterial);
    pillar.position.set(side * 7, 12, 0);
    nexusGroup.add(pillar);
  });
  city.add(nexusGroup);
  registerBuildingOccluder(nexusGroup);
}

function addDistantSkyline() {
  const skylineMaterial = new THREE.MeshStandardMaterial({ color: 0x263747, roughness: 0.98, metalness: 0.2 });
  const silhouettes = [
    [-62, -57, 34, 9, 8], [-42, -63, 45, 7, 7], [-18, -62, 30, 8, 10],
    [8, -64, 52, 10, 8], [34, -61, 38, 8, 9], [61, -54, 28, 9, 8],
    [62, 40, 41, 8, 10], [55, 60, 31, 10, 8], [-59, 42, 27, 9, 9]
  ];
  silhouettes.forEach(([x, z, height, width, depth], index) => {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), index % 3 === 0 ? materials.glass : skylineMaterial);
    tower.position.set(x, height / 2, z);
    city.add(tower);
    registerBuildingOccluder(tower);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(width * 0.7, 0.12, depth * 0.7), index % 2 ? materials.roof : materials.panel);
    crown.position.set(x, height + 0.08, z);
    city.add(crown);
  });
}

function addRoadNetwork() {
  const routes = [
    [[-52, 0.18, -37], [-37, 0.18, -37], [-22, 0.18, -37], [-7, 0.18, -22], [8, 0.18, -22], [23, 0.18, -7], [38, 0.18, -7], [53, 0.18, 8]],
    [[-37, 0.2, 53], [-37, 0.2, 38], [-37, 0.2, 23], [-22, 0.2, 8], [-7, 0.2, 8], [8, 0.2, 23], [23, 0.2, 23], [38, 0.2, 38]],
    [[-52, 0.22, 23], [-37, 0.22, 23], [-22, 0.22, 38], [-7, 0.22, 38], [8, 0.22, 38], [23, 0.22, 23], [38, 0.22, 23], [53, 0.22, 8]]
  ];
  routes.forEach((route, routeIndex) => {
    const curve = new THREE.CatmullRomCurve3(route.map(point => new THREE.Vector3(...point)), false, 'catmullrom', 0.04);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(120)), new THREE.LineBasicMaterial({ color: routeIndex === 1 ? 0xe6a85e : 0x4ee6e4, transparent: true, opacity: routeIndex === 1 ? 0.3 : 0.38 }));
    city.add(line);
    for (let i = 0; i < 5; i += 1) {
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.34, 6, 6), routeIndex === 1 ? materials.amber : materials.data);
      city.add(marker);
      dataStreams.push({ marker, curve, offset: Math.random(), speed: 0.022 + Math.random() * 0.05, glitch: Math.random() < 0.22 });
    }
  });
}

function createHouseBeacon(number, point, style) {
  const group = new THREE.Group();
  group.position.set(point.x, 0.95, point.z);
  group.renderOrder = 900;

  const core = new THREE.Mesh(houseBeaconCoreGeometry, new THREE.MeshBasicMaterial({
    color: style.color, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false
  }));
  core.scale.setScalar(0.22);
  core.renderOrder = 901;
  group.add(core);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: houseBeaconHaloTexture, color: style.color, transparent: true, opacity: 0.42,
    depthTest: false, depthWrite: false
  }));
  halo.scale.set(0.38, 0.38, 1);
  halo.renderOrder = 900;
  group.add(halo);

  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: beaconLabelTexture(number, style.color), transparent: true, opacity: 0.78,
    depthTest: false, depthWrite: false
  }));
  label.position.y = 0.68;
  label.scale.set(0.8, 0.46, 1);
  label.renderOrder = 902;
  group.add(label);

  board.add(group);
  return { group, core, halo, label, phase: Math.random() * Math.PI * 2 };
}

function addUrbanBoard() {
  const controlPoints = [
    [-54, -42], [-43, -31], [-49, -16], [-35, -7], [-42, 9], [-28, 17],
    [-34, 32], [-18, 42], [-3, 34], [8, 46], [22, 37], [16, 22],
    [30, 14], [23, 0], [38, -10], [31, -24], [46, -36], [35, -49], [18, -42], [5, -28]
  ].map(([x, z]) => new THREE.Vector3(x, 0.32 + Math.sin(x * 0.08 + z * 0.04) * 0.12, z));
  const routeCurve = new THREE.CatmullRomCurve3(controlPoints, false, 'catmullrom', 0.35);
  const routePoints = routeCurve.getPoints(59);

  // Trajeto apenas sugerido — sem linha brilhante por cima das casas, só um tubo bem discreto.
  const underlayGeometry = new THREE.TubeGeometry(routeCurve, 180, 0.28, 5, false);
  const underlay = new THREE.Mesh(underlayGeometry, new THREE.MeshBasicMaterial({ color: 0x143d48, transparent: true, opacity: 0.16, depthWrite: false }));
  board.add(underlay);

  const padGeometry = new THREE.CylinderGeometry(1.55, 1.72, 0.32, 8);
  const ringGeometry = new THREE.TorusGeometry(0.42, 0.035, 5, 12);
  routePoints.forEach((point, index) => {
    const sectorIndex = Math.min(4, Math.floor(index / 12));
    const style = sectorStyles[sectorIndex];
    const pad = new THREE.Mesh(padGeometry, new THREE.MeshBasicMaterial({ color: style.atmosphere, transparent: true, opacity: 0.94 }));
    pad.position.copy(point);
    pad.position.y = 0.18;
    board.add(pad);
    const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: index % 5 === 0 ? 1 : 0.68 }));
    ring.position.copy(point);
    ring.position.y = 0.42;
    board.add(ring);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: houseGlowTexture, color: style.color, transparent: true, opacity: 0.22, depthWrite: false, depthTest: true }));
    glow.position.set(point.x, 0.5, point.z);
    glow.scale.set(0.7, 0.7, 1);
    board.add(glow);
    // Único marcador com número: o beacon (label acima do pad). Não duplicar com sprite separado.
    const beacon = createHouseBeacon(index + 1, point, style);
    houses.push({ id: index + 1, point, sector: style.name, pad, ring, glow, beacon });
  });
  addSectorMarkers(routePoints);
  addHouseDetails(routePoints);
  addTestPieces();
}

function addSectorMarkers(routePoints) {
  [0, 12, 24, 36, 48].forEach((start, index) => {
    const point = routePoints[start];
    const style = sectorStyles[index];
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 4.5, 5), new THREE.MeshBasicMaterial({ color: style.color, transparent: true, opacity: 0.5 }));
    beacon.position.set(point.x - 2.2, 2.35, point.z - 2.2);
    board.add(beacon);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 6), new THREE.MeshBasicMaterial({ color: style.color }));
    cap.position.set(beacon.position.x, 4.65, beacon.position.z);
    board.add(cap);
  });
}

function addHouseDetails(routePoints) {
  const antennaGeometry = new THREE.CylinderGeometry(0.035, 0.06, 2.8, 4);
  const antennaMaterial = new THREE.MeshBasicMaterial({ color: 0x5c8792, transparent: true, opacity: 0.65 });
  [4, 15, 27, 41, 53].forEach((index, detailIndex) => {
    const point = routePoints[index];
    const antenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
    antenna.position.set(point.x + (detailIndex % 2 ? 3 : -3), 1.7, point.z + 2.4);
    board.add(antenna);
  });
  const cableMaterial = new THREE.LineBasicMaterial({ color: 0x42616d, transparent: true, opacity: 0.5 });
  for (let index = 5; index < routePoints.length - 5; index += 11) {
    const start = routePoints[index];
    const end = routePoints[index + 5];
    board.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(start.x, 2.8, start.z), new THREE.Vector3((start.x + end.x) / 2, 5.2, (start.z + end.z) / 2), new THREE.Vector3(end.x, 2.8, end.z)
    ]), cableMaterial));
  }
}

function createPortraitBalloonTexture(aspect) {
  const canvas = document.createElement('canvas');
  canvas.height = 512;
  canvas.width = Math.round(canvas.height * aspect);
  const context = canvas.getContext('2d');
  const inset = 22;
  const tailHeight = 58;
  const bodyBottom = canvas.height - tailHeight - inset;
  context.fillStyle = 'rgba(3, 10, 19, 0.94)';
  context.strokeStyle = 'rgba(78, 230, 228, 0.98)';
  context.lineWidth = 7;
  context.shadowColor = 'rgba(78, 230, 228, 0.48)';
  context.shadowBlur = 16;
  context.beginPath();
  context.roundRect(inset, inset, canvas.width - inset * 2, bodyBottom - inset, 58);
  context.moveTo(canvas.width * 0.43, bodyBottom - 2);
  context.lineTo(canvas.width * 0.5, canvas.height - inset);
  context.lineTo(canvas.width * 0.57, bodyBottom - 2);
  context.closePath();
  context.fill();
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function getPawnOffsetForOccupants(index, total) {
  if (total <= 1) return new THREE.Vector3();
  const radius = 1.76 / (2 * Math.sin(Math.PI / total));
  const angle = (Math.PI * 2 * index) / total;
  return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
}

function getPawnTargetPosition(piece, houseId) {
  const house = houses[houseId - 1];
  if (!house) return piece.group.position.clone();
  const occupants = pieces
    .filter(candidate => candidate.targetHouseId === houseId)
    .sort((first, second) => String(first.teamId).localeCompare(String(second.teamId)));
  if (!occupants.includes(piece)) occupants.push(piece);
  const offset = getPawnOffsetForOccupants(occupants.indexOf(piece), occupants.length);
  return new THREE.Vector3(
    house.point.x + offset.x,
    0.48,
    house.point.z + offset.z
  );
}

function addTestPieces() {
  const pieceGeometry = new THREE.ConeGeometry(0.58, 1.45, 6);
  const baseGeometry = new THREE.CylinderGeometry(0.82, 0.88, 0.16, 8);
  const textureLoader = new THREE.TextureLoader();
  gameState.teams.forEach((teamRecord, index) => {
    const group = new THREE.Group();
    const base = new THREE.Mesh(baseGeometry, new THREE.MeshStandardMaterial({ color: teamRecord.color, roughness: 0.5, metalness: 0.55 }));
    const body = new THREE.Mesh(pieceGeometry, new THREE.MeshStandardMaterial({ color: teamRecord.color, roughness: 0.45, metalness: 0.6 }));
    body.position.y = 0.78;
    group.add(base, body);
    const characterRecord = assetLibrary.get('characters', teamRecord.character);
    if (characterRecord) {
      const head = assetLibrary.instantiate(characterRecord);
      head.updateMatrixWorld(true);
      const headBounds = new THREE.Box3().setFromObject(head);
      const headScale = teamRecord.character === 'billy' ? 1.3 : ['cage', 'jaden'].includes(teamRecord.character) ? 1.15 : ['spencer', 'bubbleguy'].includes(teamRecord.character) ? 1.7 : 2;
      head.scale.multiplyScalar(headScale);
      const headBaseline = teamRecord.character === 'jaden'
        ? 1.33
        : ['billy', 'cage'].includes(teamRecord.character)
          ? 1.38
          : teamRecord.character === 'spencer' ? 1.35 : 1.48;
      head.position.y = headBaseline - headBounds.min.y * headScale;
      if (teamRecord.character === 'littlegirl' || teamRecord.character === 'mulherpunk') {
        head.position.x = -0.15;
      }
      group.add(head);
      pawnCharacterRecords.set(teamRecord.id, head);
    }
    const portraitGroup = new THREE.Group();
    const balloonMaterial = new THREE.SpriteMaterial({
      map: createPortraitBalloonTexture(1),
      transparent: true,
      opacity: 0.78,
      depthTest: false,
      depthWrite: false
    });
    const balloon = new THREE.Sprite(balloonMaterial);
    const portraitMaterial = new THREE.SpriteMaterial({
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false
    });
    const portrait = new THREE.Sprite(portraitMaterial);
    const portraitUrl = new URL(`./assets/characters/portraits/${portraitFiles[teamRecord.character]}`, import.meta.url).href;
    textureLoader.load(portraitUrl, texture => {
      const image = texture.image;
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      const cornerRadius = Math.min(canvas.width, canvas.height) * 0.08;
      context.beginPath();
      context.roundRect(0, 0, canvas.width, canvas.height, cornerRadius);
      context.clip();
      context.drawImage(image, 0, 0);
      texture.image = canvas;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;
      portrait.material.map = texture;
      portrait.material.needsUpdate = true;
      const aspect = image.width / image.height;
      const portraitHeight = 1.55;
      const portraitWidth = portraitHeight * aspect;
      const balloonWidth = portraitWidth + 0.36;
      const balloonHeight = portraitHeight + 0.54;
      portrait.scale.set(portraitWidth, portraitHeight, 1);
      balloon.scale.set(balloonWidth, balloonHeight, 1);
      const oldBalloonTexture = balloon.material.map;
      balloon.material.map = createPortraitBalloonTexture(balloonWidth / balloonHeight);
      balloon.material.needsUpdate = true;
      oldBalloonTexture.dispose();
    });
    balloon.renderOrder = 1000;
    portrait.renderOrder = 1001;
    portraitGroup.position.set(0, 2.72, 0);
    portraitGroup.add(balloon, portrait);
    group.add(portraitGroup);
    pawnPortraits.set(teamRecord.id, { group: portraitGroup, balloon, portrait });
    group.position.copy(houses[teamRecord.houseId - 1].point);
    group.position.y = 0.48;
    board.add(group);
    const piece = {
      id: index,
      name: teamRecord.name,
      group,
      cone: body,
      head: pawnCharacterRecords.get(teamRecord.id) ?? null,
      headBaseY: pawnCharacterRecords.get(teamRecord.id)?.position.y ?? 0,
      coneBaseY: body.position.y - 1.45 / 2,
      houseId: teamRecord.houseId,
      targetHouseId: teamRecord.houseId,
      color: teamRecord.color,
      character: teamRecord.character,
      phase: index * 1.8,
      teamId: teamRecord.id
    };
    pieces.push(piece);
    teamRecord.piece = pieces[index];
    pawnTemplates.set(teamRecord.character, pieces[index]);
  });
}

function loadTeamPortrait(teamRecord, balloon, portrait) {
  const character = teamRecord.character;
  const portraitUrl = new URL(`./assets/characters/portraits/${portraitFiles[character]}`, import.meta.url).href;
  new THREE.TextureLoader().load(portraitUrl, texture => {
    if (!gameState.teams.some(item => item.id === teamRecord.id) || teamRecord.character !== character) {
      texture.dispose();
      return;
    }
    const image = texture.image;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.beginPath();
    context.roundRect(0, 0, canvas.width, canvas.height, Math.min(canvas.width, canvas.height) * 0.08);
    context.clip();
    context.drawImage(image, 0, 0);
    texture.image = canvas;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.needsUpdate = true;
    portrait.material.map = texture;
    portrait.material.needsUpdate = true;
    const aspect = image.width / image.height;
    const portraitHeight = 1.55;
    const portraitWidth = portraitHeight * aspect;
    const balloonWidth = portraitWidth + 0.36;
    const balloonHeight = portraitHeight + 0.54;
    portrait.scale.set(portraitWidth, portraitHeight, 1);
    balloon.scale.set(balloonWidth, balloonHeight, 1);
    balloon.material.map = createPortraitBalloonTexture(balloonWidth / balloonHeight);
    balloon.material.needsUpdate = true;
  });
}

function createManagedPiece(teamRecord, index) {
  const source = pawnTemplates.get(teamRecord.character) ?? pieces[0];
  if (!source) return null;
  const group = source.group.clone(true);
  const head = group.children[2];
  const portraitGroup = group.children[3];
  if (!head || !portraitGroup) return null;
  const cone = group.children[1];
  cone.scale.set(1, 1, 1);
  cone.position.y = source.coneBaseY + 1.45 / 2;
  head.position.y = source.headBaseY;
  const [balloon, portrait] = portraitGroup.children;
  group.children[0].material = group.children[0].material.clone();
  group.children[1].material = group.children[1].material.clone();
  group.children[0].material.color.set(teamRecord.color);
  group.children[1].material.color.set(teamRecord.color);
  group.traverse(object => {
    if (object.isSprite) object.material = object.material.clone();
  });
  const piece = {
    id: index,
    name: teamRecord.name,
    group,
    cone,
    head,
    headBaseY: source.headBaseY,
    coneBaseY: source.coneBaseY,
    houseId: teamRecord.houseId,
    targetHouseId: teamRecord.houseId,
    color: teamRecord.color,
    character: source.character,
    phase: index * 1.8,
    teamId: teamRecord.id
  };
  group.position.copy(houses[teamRecord.houseId - 1].point);
  group.position.y = 0.48;
  board.add(group);
  pieces.push(piece);
  pawnCharacterRecords.set(teamRecord.id, head);
  pawnPortraits.set(teamRecord.id, { group: portraitGroup, balloon, portrait });
  teamRecord.piece = piece;
  loadTeamPortrait(teamRecord, balloon, portrait);
  return piece;
}

function createHousePortrait(house) {
  const group = new THREE.Group();
  const balloon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createPortraitBalloonTexture(1),
    transparent: true,
    opacity: 0.78,
    depthTest: false,
    depthWrite: false
  }));
  const portrait = new THREE.Sprite(new THREE.SpriteMaterial({
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false
  }));
  balloon.renderOrder = 1000;
  portrait.renderOrder = 1001;
  group.position.set(house.point.x, 2.72, house.point.z);
  group.add(balloon, portrait);
  board.add(group);
  const record = { group, balloon, portrait, signature: '', startedAt: 0, currentTexture: null };
  housePortraits.set(house.id, record);
  return record;
}

function removeHousePortrait(houseId, record) {
  board.remove(record.group);
  record.balloon.material.map?.dispose();
  record.balloon.material.dispose();
  record.portrait.material.dispose();
  housePortraits.delete(houseId);
}

function updateHousePortraits(elapsed) {
  const occupantsByHouse = new Map();
  const activeTeamIds = new Set(gameState.teams.filter(item => !item.finalist).map(item => item.id));
  pieces.forEach(piece => {
    if (!activeTeamIds.has(piece.teamId)) return;
    const occupants = occupantsByHouse.get(piece.targetHouseId) ?? [];
    occupants.push(piece);
    occupantsByHouse.set(piece.targetHouseId, occupants);
  });

  housePortraits.forEach((record, houseId) => {
    if ((occupantsByHouse.get(houseId)?.length ?? 0) < 2) removeHousePortrait(houseId, record);
  });

  occupantsByHouse.forEach((occupants, houseId) => {
    if (occupants.length < 2) return;
    occupants.sort((first, second) => String(first.teamId).localeCompare(String(second.teamId)));
    const house = houses[houseId - 1];
    if (!house) return;
    const record = housePortraits.get(houseId) ?? createHousePortrait(house);
    const signature = occupants.map(piece => `${piece.teamId}:${piece.character}`).join('|');
    if (record.signature !== signature) {
      record.signature = signature;
      record.startedAt = elapsed;
      record.currentTexture = null;
      record.portrait.material.map = null;
      record.portrait.material.needsUpdate = true;
    }

    const cycleIndex = Math.floor((elapsed - record.startedAt) / 2) % occupants.length;
    const currentPortrait = pawnPortraits.get(occupants[cycleIndex].teamId)?.portrait;
    const texture = currentPortrait?.material.map;
    if (texture && texture !== record.currentTexture) {
      const aspect = currentPortrait.scale.x / currentPortrait.scale.y;
      const portraitHeight = 1.55;
      const portraitWidth = portraitHeight * aspect;
      const balloonWidth = portraitWidth + 0.36;
      const balloonHeight = portraitHeight + 0.54;
      record.portrait.material.map = texture;
      record.portrait.material.needsUpdate = true;
      record.portrait.scale.set(portraitWidth, portraitHeight, 1);
      record.balloon.scale.set(balloonWidth, balloonHeight, 1);
      const oldBalloonTexture = record.balloon.material.map;
      record.balloon.material.map = createPortraitBalloonTexture(balloonWidth / balloonHeight);
      record.balloon.material.needsUpdate = true;
      oldBalloonTexture?.dispose();
      record.currentTexture = texture;
    }

    record.group.position.set(house.point.x, 2.72, house.point.z);
    const inFocus = cameraState.mode === 'FOCUS_HOUSE';
    const pulse = 1 + Math.sin(elapsed * 2.1 + houseId) * 0.025;
    const distance = camera.position.distanceTo(record.group.position);
    const distanceScale = THREE.MathUtils.clamp(1.2 + distance / 42, 1.75, 4.8);
    const visibility = inFocus ? 0.08 : THREE.MathUtils.clamp(0.72 + (distance - 18) / 90, 0.72, 0.96);
    const portraitScale = inFocus ? 0.04 : distanceScale;
    record.group.scale.setScalar(portraitScale * pulse);
    record.group.position.y = 2.72 + Math.sin(elapsed * 1.8 + houseId) * 0.045 * portraitScale;
    record.balloon.material.opacity = visibility * 0.82;
    record.portrait.material.opacity = visibility;
  });

  return occupantsByHouse;
}

function synchronizeTeamPieces() {
  const teamIds = new Set(gameState.teams.map(item => item.id));
  for (let index = pieces.length - 1; index >= 0; index -= 1) {
    const piece = pieces[index];
    if (teamIds.has(piece.teamId)) continue;
    board.remove(piece.group);
    pawnCharacterRecords.delete(piece.teamId);
    pawnPortraits.delete(piece.teamId);
    pieces.splice(index, 1);
  }
  gameState.teams.forEach((teamRecord, index) => {
    let piece = pieces.find(item => item.teamId === teamRecord.id);
    if (!piece) piece = createManagedPiece(teamRecord, index);
    if (!piece) return;
    teamRecord.piece = piece;
    piece.name = teamRecord.name;
    piece.color = teamRecord.color;
    if (piece.character !== teamRecord.character) replaceTeamAvatar(teamRecord);
    piece.group.children[0].material.color.set(teamRecord.color);
    piece.group.children[1].material.color.set(teamRecord.color);
    piece.phase = index * 1.8;
    piece.houseId = teamRecord.houseId;
    piece.targetHouseId = teamRecord.houseId;
    piece.group.position.copy(houses[teamRecord.houseId - 1].point);
    piece.group.position.y = 0.48;
    const pendingVictoryId = victorySceneState?.outcome === 'victory'
      ? victorySceneState.teamId
      : null;
    if (teamRecord.finalist && teamRecord.id !== pendingVictoryId) {
      piece.group.visible = false;
      const portrait = pawnPortraits.get(teamRecord.id);
      if (portrait) portrait.group.visible = false;
    }
  });
}

function renderFinalPodium() {
  const pendingWinnerId = victorySceneState?.outcome === 'victory'
    ? victorySceneState.teamId
    : null;
  const podium = document.querySelector('#final-podium');
  podium.hidden = !gameState.finalRanking.some(entry => entry.teamId !== pendingWinnerId);
  for (let place = 1; place <= 3; place += 1) {
    const slot = document.querySelector(`#final-podium-list [data-podium-place="${place}"]`);
    const entry = gameState.finalRanking.find(item =>
      item.order === place && item.teamId !== pendingWinnerId
    );
    const teamRecord = entry && gameState.teams.find(item => item.id === entry.teamId);
    const portrait = slot.querySelector('img');
    const name = slot.querySelector('.podium-name');
    slot.classList.toggle('is-ranked', Boolean(teamRecord));
    portrait.hidden = !teamRecord;
    portrait.alt = teamRecord ? `Retrato de ${teamRecord.name}` : '';
    portrait.removeAttribute('src');
    if (teamRecord) {
      portrait.src = new URL(
        `./assets/characters/portraits/${portraitFiles[teamRecord.character]}`,
        import.meta.url
      ).href;
    }
    name.textContent = teamRecord?.name ?? '—';
  }
}

function replaceTeamAvatar(teamRecord) {
  const piece = teamRecord.piece;
  const oldHead = pawnCharacterRecords.get(teamRecord.id);
  if (!piece || !oldHead) return;
  const headIndex = piece.group.children.indexOf(oldHead);
  const portraitGroup = pawnPortraits.get(teamRecord.id)?.group;
  piece.group.remove(oldHead);
  const characterRecord = assetLibrary.get('characters', teamRecord.character);
  if (characterRecord) {
    const head = assetLibrary.instantiate(characterRecord);
    head.updateMatrixWorld(true);
    const headBounds = new THREE.Box3().setFromObject(head);
    const headScale = teamRecord.character === 'billy' ? 1.3 : ['cage', 'jaden'].includes(teamRecord.character) ? 1.15 : ['spencer', 'bubbleguy'].includes(teamRecord.character) ? 1.7 : 2;
    head.scale.multiplyScalar(headScale);
    const headBaseline = teamRecord.character === 'jaden'
      ? 1.33
      : ['billy', 'cage'].includes(teamRecord.character)
        ? 1.38
        : teamRecord.character === 'spencer' ? 1.35 : 1.48;
    head.position.y = headBaseline - headBounds.min.y * headScale;
    if (teamRecord.character === 'littlegirl' || teamRecord.character === 'mulherpunk') {
      head.position.x = -0.15;
    }
    piece.group.add(head);
    piece.group.children.splice(piece.group.children.indexOf(head), 1);
    piece.group.children.splice(headIndex, 0, head);
    piece.head = head;
    piece.headBaseY = head.position.y;
    pawnCharacterRecords.set(teamRecord.id, head);
    piece.character = teamRecord.character;
    pawnTemplates.set(teamRecord.character, piece);
    if (portraitGroup) {
      piece.group.remove(portraitGroup);
      piece.group.add(portraitGroup);
      const portrait = pawnPortraits.get(teamRecord.id);
      loadTeamPortrait(teamRecord, portrait.balloon, portrait.portrait);
    }
  }
}

function pushHistory(message) {
  gameState.history.unshift(message);
  gameState.history = gameState.history.slice(0, 4);
  const list = document.querySelector('#history-list');
  if (list) {
    list.replaceChildren(...gameState.history.map(item => {
      const entry = document.createElement('span');
      entry.textContent = item;
      return entry;
    }));
  }
}

function dismissGlobalEventIndicator() {
  const eventIndicator = document.querySelector('#global-event-indicator');
  if (!gameState.activeEvent) {
    eventIndicator.hidden = true;
    return;
  }
  globalEventDismissedId = gameState.activeEvent;
  eventIndicator.hidden = true;
}

function updateGameHud() {
  const current = team(gameState);
  document.querySelector('#roll-dice').disabled = gameState.paused || gameState.finished ||
    current.finalist || gameState.phase !== 'PREPARING';
  const phaseLabels = {
    FROZEN_ESCAPE: 'CONGELAMENTO // PROTOCOLO DE FUGA',
    VIRUS_INJECTION_ESCAPE: 'VÍRUS INJETADO // PROTOCOLO DE REMOÇÃO',
    PREPARING: 'AGUARDANDO LANÇAMENTO',
    ROLLING: 'DADO ROLANDO',
    DICE_RESULT: 'RESULTADO DO DADO',
    FOCUSING_PAWN: 'FOCO NA GANGUE',
    MOVING: 'EM MOVIMENTO',
    ARRIVING_HOUSE: 'CHEGANDO À CASA',
    RESOLVING_HOUSE: 'AÇÃO DA CASA',
    FINAL_CHALLENGE: 'PROVA FINAL',
    FINALIZING: 'FINALIZANDO TURNO',
    FINISHED: 'PARTIDA FINALIZADA'
  };
  document.querySelector('#turn-team-name').textContent = current.name;
  document.querySelector('#turn-position').textContent = `CASA ${String(current.houseId).padStart(2, '0')}`;
  document.querySelector('#turn-hacks').textContent = `HACKS ${String(current.hacks).padStart(2, '0')}`;
  const firewallBadge = document.querySelector('#turn-firewall');
  firewallBadge.hidden = !isGangProtectedByFirewall(gameState, current.id);
  document.querySelector('#turn-state').textContent = `TURNO · ${gameState.paused ? 'PAUSADO' : phaseLabels[gameState.phase] ?? gameState.phase}`;
  document.querySelector('#turn-portrait').style.backgroundImage = `url("${new URL(`./assets/characters/portraits/${portraitFiles[current.character]}`, import.meta.url).href}")`;
  renderFinalPodium();
  const activeEvent = professorEvents.find(item => item.id === gameState.activeEvent);
  document.querySelector('#event-state').textContent = activeEvent?.name ?? 'NENHUM ATIVO';
  const eventIndicator = document.querySelector('#global-event-indicator');
  const proceedButton = document.querySelector('#global-event-proceed');
  document.querySelector('#global-event-name').textContent = activeEvent?.name ?? '';
  document.querySelector('#global-event-description').textContent = activeEvent?.description ?? '';
  if (!activeEvent) {
    presentedGlobalEventId = null;
    globalEventDismissedId = null;
    eventIndicator.hidden = true;
    proceedButton.hidden = true;
  } else {
    proceedButton.hidden = globalEventDismissedId === gameState.activeEvent;
    const shouldShowIndicator = gameState.activeEvent !== presentedGlobalEventId ||
      globalEventDismissedId !== gameState.activeEvent;
    eventIndicator.hidden = !shouldShowIndicator;
    if (gameState.activeEvent !== presentedGlobalEventId) {
      presentedGlobalEventId = gameState.activeEvent;
      globalEventDismissedId = null;
      eventIndicator.classList.remove('is-activated');
      if (globalEventPulseTimeoutId !== null) {
        window.clearTimeout(globalEventPulseTimeoutId);
        globalEventPulseTimeoutId = null;
      }
      void eventIndicator.offsetWidth;
      eventIndicator.classList.add('is-activated');
      globalEventPulseTimeoutId = window.setTimeout(() => {
        eventIndicator.classList.remove('is-activated');
        globalEventPulseTimeoutId = null;
      }, 1500);
    } else if (globalEventDismissedId === gameState.activeEvent) {
      eventIndicator.hidden = true;
    }
  }
  renderProfessorCenter();
  renderHackActions();
  if (gameState.phase === 'FROZEN_ESCAPE' && !gameState.action) {
    openFrozenEscapeProtocol();
  }
  if (gameState.phase === 'VIRUS_INJECTION_ESCAPE' && !gameState.action) {
    openVirusInjectionProtocol();
  }
}

const HACK_PRESENTATIONS = Object.freeze({
  TURBO: { label: 'TURBO', glyph: 'speed', summary: 'IMPULSO // +2 CASAS // DESTINO INATIVO', description: 'Avance +2 casas imediatamente.' },
  ESCUDO: { label: 'ESCUDO', glyph: 'shield', summary: 'BARREIRA ATIVA // PENALIDADE BLOQUEADA', description: 'Cancela uma penalidade recebida.' },
  INTERCEPTAR: { label: 'INTERCEPTAR', glyph: 'intercept', summary: 'SINAL CAPTURADO // ROUBO DE HACK', description: 'Tente roubar 1 HACK de outra gangue.' },
  OVERRIDE: { label: 'OVERRIDE', glyph: 'override', summary: 'COMANDO SUBSTITUÍDO // EFEITO CANCELADO', description: 'Ignora o desafio da casa atual.' }
});

function createHackIcon(hackId, className = '') {
  const presentation = HACK_PRESENTATIONS[hackId];
  const icon = document.createElement('span');
  icon.className = `hack-glyph hack-glyph-${presentation?.glyph ?? 'override'} ${className}`.trim();
  icon.setAttribute('aria-hidden', 'true');
  const paths = {
    speed: '<path d="M4 8h9M2 12h11M5 16h8"/><path d="m14 5 7 7-7 7V5Z"/>',
    shield: '<path d="M12 2 20 5v6c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11V5l8-3Z"/><path d="m8 12 2.5 2.5L16 9"/>',
    intercept: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M2 12h4m12 0h4M12 2v4m0 12v4"/>',
    override: '<path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/><path d="M8 12h8m-4-4v8"/>'
  };
  icon.innerHTML = `<svg viewBox="0 0 24 24" focusable="false">${paths[presentation?.glyph ?? 'override']}</svg>`;
  return icon;
}

function showHackActivation(hackId, title, message, { simple = false } = {}) {
  const presentation = HACK_PRESENTATIONS[hackId];
  const popup = document.querySelector('#action-popup');
  const feedback = document.querySelector('#action-feedback');
  const titleElement = document.querySelector('#action-title');
  const prompt = document.querySelector('#action-prompt');
  popup.querySelector('.action-activation-banner')?.remove();
  popup.querySelector('.hack-activation-display')?.remove();
  popup.classList.remove('is-hack-speed', 'is-hack-shield', 'is-hack-intercept', 'is-hack-override');
  const display = document.createElement('div');
  display.className = `hack-activation-display hack-activation-${presentation.glyph}`;
  display.append(createHackIcon(hackId, 'hack-activation-icon'));
  if (!simple) {
    const copy = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = presentation.label;
    const detail = document.createElement('span');
    detail.textContent = message;
    copy.append(name, detail);
    display.append(copy);
  }

  popup.querySelector('.action-card').insertBefore(display, titleElement);
  popup.classList.remove('is-event-activation', 'is-hack-activation');
  popup.classList.add(`is-hack-activation`, `is-hack-${presentation.glyph}`);
  document.querySelector('#action-type').textContent = simple ? '' : 'HACK EXECUTADO';
  titleElement.textContent = title;
  titleElement.setAttribute('aria-label', title);
  prompt.textContent = message;
  prompt.setAttribute('aria-label', message);
  prompt.classList.remove('is-house-explanation', 'is-event-result');
  renderCodeBlock(null, document.querySelector('#action-code'), document.querySelector('#action-code-content'));
  document.querySelector('#action-options').replaceChildren();
  feedback.replaceChildren();
  feedback.className = 'action-feedback is-correct';
  feedback.hidden = true;
  const continueButton = document.querySelector('#close-action');
  continueButton.disabled = false;
  continueButton.textContent = 'FINALIZAR TURNO';
  popup.classList.remove('is-incorrect', 'is-opening');
  popup.classList.add('is-correct');
  popup.hidden = false;
  updateGameHud();
}

function showHackReward(hackId) {
  const presentation = HACK_PRESENTATIONS[hackId];
  if (!presentation) throw new Error(`HACK inválido para recompensa: ${hackId}`);
  const popup = document.querySelector('#action-popup');
  const title = document.querySelector('#action-title');
  const prompt = document.querySelector('#action-prompt');
  const feedback = document.querySelector('#action-feedback');
  const options = document.querySelector('#action-options');
  const continueButton = document.querySelector('#close-action');
  popup.querySelector('.action-activation-banner')?.remove();
  popup.querySelector('.hack-activation-display')?.remove();
  popup.classList.remove('is-event-activation');
  popup.classList.add('is-hack-activation', `is-hack-${presentation.glyph}`, 'is-correct');
  const display = document.createElement('div');
  display.className = `hack-activation-display hack-activation-${presentation.glyph}`;
  display.append(createHackIcon(hackId, 'hack-activation-icon'));
  const copy = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = presentation.label;
  const reward = document.createElement('span');
  reward.textContent = '+1 HACK';
  const description = document.createElement('span');
  description.textContent = presentation.description;
  copy.append(name, reward, description);
  display.append(copy);
  popup.querySelector('.action-card').insertBefore(display, title);
  document.querySelector('#action-type').textContent = 'HACK OBTIDO';
  title.textContent = 'RECOMPENSA DE HACK';
  prompt.textContent = `${presentation.label}\n+1 HACK\n${presentation.description}`;
  prompt.setAttribute('aria-label', prompt.textContent);
  prompt.classList.remove('is-house-explanation', 'is-event-result');
  renderCodeBlock(null, document.querySelector('#action-code'), document.querySelector('#action-code-content'));
  options.replaceChildren();
  feedback.replaceChildren();
  feedback.hidden = true;
  continueButton.disabled = false;
  continueButton.textContent = 'PROSSEGUIR';
  popup.hidden = false;
}

function renderHackActions() {
  const container = document.querySelector('#hack-actions');
  if (!container) return;
  const current = team(gameState);
  const hackCount = getHackCount(current);
  const blockedByBlackout = gameState.activeEvent === 'BLACKOUT';
  const interceptTargetsAvailable = getInterceptTargets(gameState, current.id).length > 0;
  const overrideAvailable = gameState.phase === 'RESOLVING_HOUSE' &&
    gameState.action?.questionResolution !== 'FINAL_CHALLENGE' &&
    canOverrideAction(gameState.action);
  const options = [
    {
      id: 'TURBO',
      label: 'TURBO',
      glyph: 'speed',
      summary: '+2 casas · destino não ativa',
      description: HACK_PRESENTATIONS.TURBO.description,
      handler: () => runTurboHack()
    },
    {
      id: 'INTERCEPTAR',
      label: 'INTERCEPTAR',
      glyph: 'intercept',
      summary: 'alvo errou? rouba 1 HACK',
      description: HACK_PRESENTATIONS.INTERCEPTAR.description,
      handler: () => openInterceptSelection()
    },
    {
      id: 'ESCUDO',
      label: 'ESCUDO',
      glyph: 'shield',
      summary: 'cancela penalidade',
      description: HACK_PRESENTATIONS.ESCUDO.description,
      handler: null
    },
    {
      id: 'OVERRIDE',
      label: 'OVERRIDE',
      glyph: 'override',
      summary: 'cancela efeito da casa',
      description: HACK_PRESENTATIONS.OVERRIDE.description,
      handler: () => runOverrideHack()
    }
  ];

  container.replaceChildren();
  container.setAttribute('aria-label', `HACKs da gangue ${current.name}`);
  const heading = document.createElement('div');
  heading.className = 'hack-actions-heading';
  const label = document.createElement('span');
  label.textContent = 'HACKS';
  const count = document.createElement('strong');
  count.textContent = `${hackCount}/3`;
  heading.append(label, count);

  const status = document.createElement('span');
  status.className = 'hack-actions-status';
  if (hackCount === 0) {
    status.textContent = 'NENHUM HACK DISPONÍVEL';
  } else if (blockedByBlackout) {
    status.textContent = 'BLOQUEADO PELO APAGÃO';
    status.classList.add('is-blocked');
  } else if (gameState.hackUsedThisTurn) {
    status.textContent = 'JÁ USOU UM HACK NESTE TURNO';
    status.classList.add('is-blocked');
  } else if (gameState.paused) {
    status.textContent = 'INDISPONÍVEL ENQUANTO PAUSADA';
    status.classList.add('is-blocked');
  } else if (gameState.finished || current.finalist) {
    status.textContent = 'PARTIDA ENCERRADA PARA ESTA GANGUE';
    status.classList.add('is-blocked');
  } else if (gameState.phase === 'PREPARING' || overrideAvailable) {
    status.textContent = gameState.phase === 'PREPARING'
      ? 'TURBO: +2 CASAS · ESCUDO: USO EM PENALIDADE'
      : 'OVERRIDE DISPONÍVEL · ESCUDO EM PENALIDADE';
  } else {
    status.textContent = 'NENHUMA AÇÃO APLICÁVEL NESTA FASE';
    status.classList.add('is-blocked');
  }

  const list = document.createElement('div');
  list.className = 'hack-action-list';
  let hasUsableHackAction = false;
  options.forEach(option => {
    let unavailableReason = '';
    if (blockedByBlackout) {
      unavailableReason = 'BLOQUEADO PELO APAGÃO';
    } else if (gameState.hackUsedThisTurn) {
      unavailableReason = 'JÁ USOU UM HACK NESTE TURNO';
    } else if (gameState.paused) {
      unavailableReason = 'INDISPONÍVEL ENQUANTO PAUSADA';
    } else if (gameState.finished || current.finalist) {
      unavailableReason = 'PARTIDA ENCERRADA PARA ESTA GANGUE';
    } else if (option.id === 'TURBO' || option.id === 'INTERCEPTAR') {
      if (gameState.phase !== 'PREPARING') {
        unavailableReason = 'DISPONÍVEL ANTES DO LANÇAMENTO';
      } else if (option.id === 'INTERCEPTAR' && !interceptTargetsAvailable) {
        unavailableReason = 'SEM ALVO VÁLIDO COM HACK';
      }
    } else if (!overrideAvailable) {
      unavailableReason = 'DISPONÍVEL DURANTE AÇÃO COMPATÍVEL';
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hack-action-button';
    button.dataset.hack = option.id;
    button.dataset.tooltipTitle = option.label;
    button.dataset.tooltip = option.description + (blockedByBlackout ? ' Bloqueado pelo APAGÃO.' : '');
    button.disabled = Boolean(unavailableReason || hackCount === 0 || !hasHack(current, option.id) || !option.handler);
    const hackName = document.createElement('strong');
    hackName.textContent = option.label;
    hackName.dataset.count = String(getHackTypeCount(current, option.id));
    const hackSummary = document.createElement('span');
    hackSummary.textContent = option.summary;
    button.append(createHackIcon(option.id, 'hack-action-icon'), hackName, hackSummary);
    button.setAttribute('aria-label', `${option.label}: ${button.dataset.tooltip}`);
    if (option.handler) button.addEventListener('click', option.handler);
    list.append(button);
    if (!button.disabled) hasUsableHackAction = true;
  });
  if (hackCount > 0 && !blockedByBlackout && !gameState.hackUsedThisTurn &&
      !gameState.paused && !gameState.finished && !current.finalist &&
      gameState.phase === 'PREPARING') {
    const shieldNote = document.createElement('span');
    shieldNote.className = 'hack-actions-guidance';
    shieldNote.append(createHackIcon('ESCUDO', 'hack-guidance-icon'));
    shieldNote.append(document.createTextNode(
      `1 HACK/TURNO · ESCUDO DISPONÍVEL EM PENALIDADES${interceptTargetsAvailable ? '' : ' · SEM ALVO PARA INTERCEPTAR'}`
    ));
    list.append(shieldNote);
  }
  container.append(heading, status, list);
  const tooltipPanel = document.querySelector('#hack-tooltip-panel');
  const tooltipTitle = document.querySelector('#hack-tooltip-title');
  const tooltipDescription = document.querySelector('#hack-tooltip-description');
  const hideHackTooltip = () => {
    tooltipPanel.hidden = true;
  };
  const showHackTooltip = button => {
    tooltipTitle.textContent = button.dataset.tooltipTitle;
    tooltipDescription.textContent = button.dataset.tooltip;
    tooltipPanel.hidden = false;
  };
  list.addEventListener('pointerover', event => {
    const button = event.target.closest('.hack-action-button');
    if (button) showHackTooltip(button);
  });
  list.addEventListener('pointerout', event => {
    if (!event.relatedTarget || !list.contains(event.relatedTarget)) hideHackTooltip();
  });
  list.addEventListener('focusin', event => {
    const button = event.target.closest('.hack-action-button');
    if (button) showHackTooltip(button);
  });
  list.addEventListener('focusout', event => {
    if (!list.contains(event.relatedTarget)) hideHackTooltip();
  });
  container.closest('.turn-hud')?.classList.toggle('has-usable-hack', hasUsableHackAction);
}

function runTurboHack() {
  const current = team(gameState);
  const startHouse = current.houseId;
  const result = useTurbo(gameState, current.id);
  if (!result.ok) {
    statusMessage.textContent = 'TURBO INDISPONÍVEL // ESTADO ATUALIZADO';
    updateGameHud();
    return;
  }
  const destination = current.houseId;
  const moved = destination - startHouse;
  current.piece.houseId = startHouse;
  current.piece.targetHouseId = startHouse;
  const pawnPosition = current.piece.group.getWorldPosition(new THREE.Vector3());
  pawnPosition.y += 1.1;
  focusHouse(startHouse, pawnPosition);
  if (moved && !queuePawnMovement(current, startHouse, destination, {
    onComplete: () => {
      returnToMap();
      updateGameHud();
    }
  })) {
    console.error('Não foi possível iniciar a animação do HACK TURBO.');
    if (!grantHack(gameState, current.id, 'TURBO')) {
      console.error('Não foi possível restituir o HACK TURBO após falha na animação.');
    }
    gameState.hackUsedThisTurn = false;
    gameState.phase = 'PREPARING';
    current.houseId = startHouse;
    current.piece.houseId = startHouse;
    current.piece.targetHouseId = startHouse;
    statusMessage.textContent = 'TURBO NÃO APLICADO // FALHA NA ANIMAÇÃO';
    returnToMap();
    updateGameHud();
    return;
  }
  pushHistory(`${current.name} usou TURBO // +${moved} casa(s)`);
  statusMessage.textContent = `TURBO ATIVADO // +${moved} CASA(S)`;
  showHackActivation('TURBO', 'TURBO ATIVADO', `+${moved} CASA(S)`, { simple: true });
  if (!moved) {
    returnToMap();
  }
  updateGameHud();
}

function showHackTurnFeedback(title, message) {
  showHackActivation('OVERRIDE', title, message);
}

function createDoubleDiceVisual() {
  const visual = document.createElement('div');
  visual.className = 'double-dice-visual';
  visual.setAttribute('role', 'img');
  visual.setAttribute('aria-label', 'Dado clássico de seis faces');
  visual.style.setProperty('--dice-roll-duration', `${DICE_ROLL_DURATION}s`);

  const cube = document.createElement('div');
  cube.className = 'double-dice-cube';
  cube.dataset.value = '1';
  cube.setAttribute('aria-hidden', 'true');
  DICE_PIP_LAYOUT.forEach((positions, index) => {
    const face = document.createElement('div');
    face.className = `double-dice-face double-dice-face-${index + 1}`;
    for (let position = 0; position < 9; position += 1) {
      const pip = document.createElement('span');
      if (positions.includes(position)) pip.className = 'is-pip';
      face.append(pip);
    }
    cube.append(face);
  });
  visual.append(cube);
  return visual;
}

function clearDoubleDiceVisual() {
  activeDoubleDiceVisual?.remove();
  activeDoubleDiceVisual = null;
  document.querySelector('#action-popup').classList.remove('is-double-dice');
}

function runOverrideHack() {
  const current = team(gameState);
  if (!canOverrideAction(gameState.action) ||
      gameState.phase !== 'RESOLVING_HOUSE' ||
      gameState.action?.questionResolution === 'FINAL_CHALLENGE' ||
      !useOverride(gameState, current.id, gameState.action)) {
    statusMessage.textContent = 'OVERRIDE INDISPONÍVEL // EFEITO PRESERVADO';
    updateGameHud();
    return;
  }
  if (!beginFinalizing(gameState)) {
    console.error('OVERRIDE foi consumido, mas o turno não pôde ser finalizado.');
    return;
  }
  stopQuestionTimer();
  questionInteractionToken += 1;
  pushHistory(`${current.name} usou OVERRIDE // EFEITO DA CASA CANCELADO`);
  statusMessage.textContent = 'OVERRIDE ATIVADO // EFEITO DA CASA CANCELADO';
  showHackTurnFeedback('OVERRIDE ATIVADO', 'EFEITO DA CASA CANCELADO');
}

function openInterceptSelection() {
  const current = team(gameState);
  const targets = getInterceptTargets(gameState, current.id);
  if (!targets.length) {
    statusMessage.textContent = 'INTERCEPTAR INDISPONÍVEL // SEM ALVO COM HACK';
    updateGameHud();
    return;
  }
  const availableTargets = targets.filter(target =>
    !isProtectedByFirewall(gameState, 'INTERCEPTAR', target.id)
  );
  if (!availableTargets.length) {
    const target = targets[0];
    const started = beginIntercept(gameState, current.id, target.id);
    if (!started.ok || !started.blocked) {
      console.error('Não foi possível resolver o bloqueio de INTERCEPTAR pelo FIREWALL.', started);
      return;
    }
    if (!beginFinalizing(gameState)) {
      console.error('INTERCEPTAR foi bloqueado pelo FIREWALL, mas o turno não pôde ser finalizado.');
      return;
    }
    pushHistory(`${current.name} NÃO ROUBOU HACK DE ${target.name} // FIREWALL`);
    statusMessage.textContent = `FIREWALL BLOQUEOU INTERCEPTAR // HACK PRESERVADO`;
    showHackActivation(
      'INTERCEPTAR',
      'FIREWALL BLOQUEOU O ROUBO',
      'ALVOS PROTEGIDOS // NENHUM HACK FOI TRANSFERIDO'
    );
    return;
  }
  const choices = targets.map(target => target.name);
  openHouseAction(current.houseId, {
    type: 'INTERCEPT_TARGET',
    status: 'CHOICE',
    choices,
    interceptTargets: targets.map(target => target.id),
    message: 'SELECIONE A GANGUE ALVO'
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function renderProfessorCenter() {
  const current = team(gameState);
  const turnState = document.querySelector('#admin-turn-state');
  if (!turnState) return;
  document.querySelector('#admin-current-team').textContent = current.name;
  document.querySelector('#admin-current-position').textContent = current.houseId;
  document.querySelector('#admin-current-hacks').textContent = current.hacks;
  turnState.textContent = gameState.paused ? 'PAUSADA' : gameState.phase.replaceAll('_', ' ');
  document.querySelector('#pause-game').disabled = gameState.paused;
  document.querySelector('#continue-game').disabled = !gameState.paused;
  document.querySelector('#next-turn').disabled = gameState.paused ||
    gameState.phase !== 'FINALIZING' || gameState.moving || Boolean(diceMove) || Boolean(diceRoll);

  const teamList = document.querySelector('#admin-team-list');
  teamList.innerHTML = gameState.teams.map(item => {
    const portrait = new URL(`./assets/characters/portraits/${portraitFiles[item.character]}`, import.meta.url).href;
    const members = item.members.map(escapeHtml).join(', ');
    return `<article class="admin-team-card">
      <div class="admin-team-top"><img src="${portrait}" alt=""><div><span class="gang-entry-mark" style="display:inline-block;background:#${Number(item.color).toString(16).padStart(6, '0')}"></span><div class="admin-team-name">${escapeHtml(item.name)}</div></div></div>
      <div class="admin-team-meta"><span>Integrantes: ${members}</span><span>Posição: casa ${item.houseId}</span><span>HACKs: ${item.hacks} / 3</span></div>
      <div class="admin-team-actions"><button type="button" data-team-edit="${escapeHtml(item.id)}">EDITAR</button><button type="button" data-team-delete="${escapeHtml(item.id)}">EXCLUIR</button></div>
    </article>`;
  }).join('');

  const correctionTeam = document.querySelector('#correction-team');
  const selectedTeamId = correctionTeam.value || current.id;
  correctionTeam.innerHTML = gameState.teams.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
  correctionTeam.value = gameState.teams.some(item => item.id === selectedTeamId) ? selectedTeamId : current.id;
  const testTeam = document.querySelector('#test-house-team');
  const testTeamId = testTeam.value || current.id;
  testTeam.innerHTML = gameState.teams.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
  testTeam.value = gameState.teams.some(item => item.id === testTeamId) ? testTeamId : current.id;
  updateAdminEventCards();
}

function updateAdminEventCards() {
  const eventList = document.querySelector('#admin-event-list');
  if (!eventList) return;
  eventList.innerHTML = professorEvents.map(item => `
    <article class="admin-event-card${gameState.activeEvent === item.id ? ' is-active' : ''}">
      <span class="admin-event-name">${item.name}</span>
      <span class="admin-event-actions"><button type="button" data-event="${item.id}"${gameState.activeEvent === item.id ? ' disabled' : ''}>${gameState.activeEvent === item.id ? 'ATIVO' : 'ATIVAR'}</button><button class="help-button" type="button" aria-label="Sobre ${item.name}" data-tooltip="${item.description}">i</button></span>
    </article>`).join('');
}

let actionTextAnimationId = 0;
let questionTimerId = null;
let finalWindowTimerId = null;
let questionInteractionToken = 0;
let pendingHouseExplanationId = null;
let pendingFinalProtocolNarrativeStage = null;
let resetQuestionTimer = null;

function decodeActionText(element, text, animationId) {
  const glyphs = '!<>-_\\/[]{}—=+*^?#';
  const characters = [...text];
  const duration = 700;
  const scrambleHold = 0.2;
  const startedAt = performance.now();
  element.setAttribute('aria-label', text);
  const update = now => {
    if (animationId !== actionTextAnimationId || document.querySelector('#action-popup').hidden) return;
    const progress = Math.min(1, (now - startedAt) / duration);
    const decodeProgress = Math.max(0, Math.min(1, (progress - scrambleHold) / (1 - scrambleHold)));
    const resolvedCount = Math.floor(decodeProgress * characters.length);
    element.textContent = characters.map((character, index) => {
      if (character === ' ' || character === '\n' || index < resolvedCount) return character;
      return glyphs[Math.floor(Math.random() * glyphs.length)];
    }).join('');
    if (progress < 1) requestAnimationFrame(update);
    else element.textContent = text;
  };
  requestAnimationFrame(update);
}

function stopQuestionTimer() {
  if (questionTimerId !== null) {
    clearInterval(questionTimerId);
    questionTimerId = null;
  }
  resetQuestionTimer = null;
  const timer = document.querySelector('#action-timer');
  if (timer) {
    timer.hidden = true;
    timer.textContent = '';
  }
}

function startQuestionTimer(seconds, onTimeout) {
  stopQuestionTimer();
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const timer = document.querySelector('#action-timer');
  const finalAttempt = gameState.action?.questionResolution === 'FINAL_CHALLENGE'
    ? gameState.finalChallenge
    : null;
  let remainingMs = finalAttempt?.status === 'ACTIVE' &&
    Number.isFinite(finalAttempt.remainingMs)
    ? Math.min(seconds * 1000, finalAttempt.remainingMs)
    : seconds * 1000;
  let previousTime = performance.now();
  let timeoutDispatched = false;
  const render = () => {
    timer.textContent = `◷ ${Math.ceil(remainingMs / 1000)}s`;
    timer.hidden = false;
  };
  resetQuestionTimer = () => {
    if (timeoutDispatched) return;
    remainingMs = seconds * 1000;
    if (finalAttempt?.status === 'ACTIVE') finalAttempt.remainingMs = remainingMs;
    previousTime = performance.now();
    render();
  };
  render();
  questionTimerId = setInterval(() => {
    const now = performance.now();
    if (!gameState.paused) remainingMs = Math.max(0, remainingMs - (now - previousTime));
    previousTime = now;
    if (finalAttempt?.status === 'ACTIVE') finalAttempt.remainingMs = remainingMs;
    render();
    if (remainingMs > 0 || timeoutDispatched) return;
    timeoutDispatched = true;
    if (finalAttempt?.status === 'ACTIVE') finalAttempt.remainingMs = 0;
    clearInterval(questionTimerId);
    questionTimerId = null;
    resetQuestionTimer = null;
    onTimeout();
  }, 100);
}

function stopFinalWindowTimer() {
  if (finalWindowTimerId !== null) {
    clearInterval(finalWindowTimerId);
    finalWindowTimerId = null;
  }
}

function showFinalStandings() {
  const popup = document.querySelector('#action-popup');
  const feedback = document.querySelector('#action-feedback');
  stopQuestionTimer();
  questionInteractionToken += 1;
  popup.classList.remove('is-correct', 'is-incorrect', 'is-opening');
  document.querySelector('#action-prompt').classList.remove('is-house-explanation', 'is-event-result');
  document.querySelector('#action-options').classList.remove('has-gang-targets');
  feedback.className = 'action-feedback';
  document.querySelector('#action-type').textContent = 'CLASSIFICAÇÃO FINAL';
  document.querySelector('#action-title').textContent = 'CENTRAL NEXUS // RESULTADO FINAL';
  document.querySelector('#action-prompt').textContent = gameState.winner
    ? `VENCEDOR: ${gameState.teams.find(item => item.id === gameState.winner)?.name ?? gameState.winner}`
    : 'A JANELA FINAL FOI ENCERRADA.';
  document.querySelector('#action-options').replaceChildren();
  feedback.replaceChildren();
  gameState.finalRanking.forEach(entry => {
    const row = document.createElement('p');
    row.textContent = `${entry.order}º LUGAR // ${gameState.teams.find(item => item.id === entry.teamId)?.name ?? entry.teamId}`;
    feedback.append(row);
  });
  if (!gameState.finalRanking.length) feedback.textContent = 'NENHUMA EQUIPE CONCLUIU A PROVA FINAL.';
  feedback.hidden = false;
  document.querySelector('#action-timer').hidden = true;
  document.querySelector('#action-code').hidden = true;
  document.querySelector('#close-action').disabled = false;
  document.querySelector('#close-action').textContent = 'FECHAR CLASSIFICAÇÃO';
  popup.hidden = false;
  stopFinalWindowTimer();
}

function typeVictoryText(element, text, delay = 0, characterInterval = 18) {
  clearVictoryText(element);
  element.textContent = '';
  const typing = { delayId: null, intervalId: null };
  if (victorySceneState) victorySceneState.typingIntervals.set(element, typing);
  typing.delayId = window.setTimeout(() => {
    let index = 0;
    typing.intervalId = window.setInterval(() => {
      element.textContent = text.slice(0, index += 1);
      if (index >= text.length) {
        window.clearInterval(typing.intervalId);
        if (victorySceneState?.typingIntervals.get(element) === typing) {
          victorySceneState.typingIntervals.delete(element);
        }
      }
    }, characterInterval);
    victorySceneState?.timers.push(typing.intervalId);
  }, delay);
  if (victorySceneState) victorySceneState.timers.push(typing.delayId);
}

function clearVictoryText(element) {
  const typing = victorySceneState?.typingIntervals.get(element);
  if (!typing) return;
  window.clearTimeout(typing.delayId);
  if (typing.intervalId !== null) window.clearInterval(typing.intervalId);
  victorySceneState.typingIntervals.delete(element);
}

function scheduleVictoryScene(callback, delay) {
  const timeoutId = window.setTimeout(callback, delay);
  victorySceneState?.timers.push(timeoutId);
}

function restoreVictoryStage(state) {
  const { piece, stageRig, parent, basePosition, baseRotation, baseScale, parentIndex, roots, portrait, sceneBackground,
    sceneFog, cameraPosition, cameraQuaternion, cameraFov, cameraState: savedCameraState } = state;
  piece.group.removeFromParent();
  stageRig.removeFromParent();
  parent.add(piece.group);
  const reorderedChildren = parent.children;
  const currentIndex = reorderedChildren.indexOf(piece.group);
  reorderedChildren.splice(currentIndex, 1);
  reorderedChildren.splice(Math.min(parentIndex, reorderedChildren.length), 0, piece.group);
  piece.group.position.copy(basePosition);
  piece.group.rotation.copy(baseRotation);
  piece.group.scale.copy(baseScale);
  piece.group.visible = state.pieceVisible;
  if (portrait) portrait.group.visible = state.portraitVisible;
  roots.forEach(({ object, visible }) => { object.visible = visible; });
  scene.background = sceneBackground;
  scene.fog = sceneFog;
  camera.position.copy(cameraPosition);
  camera.quaternion.copy(cameraQuaternion);
  camera.fov = cameraFov;
  camera.updateProjectionMatrix();
  Object.assign(cameraState, savedCameraState);
  targetFov = state.targetFov;
  document.querySelector('.city-shell').classList.remove('is-final-cinematic');
  document.querySelector('#victory-title').className = '';
  document.querySelector('#victory-message').className = '';
}

function closeVictoryScene({ finish = false } = {}) {
  const sceneElement = document.querySelector('#victory-scene');
  if (!victorySceneState) return;
  victorySceneState.timers.forEach(timerId => {
    window.clearTimeout(timerId);
    window.clearInterval(timerId);
  });
  const state = victorySceneState;
  restoreVictoryStage(state);
  victorySceneState = null;
  if (state.outcome === 'victory') {
    state.piece.group.visible = false;
    if (state.portrait) state.portrait.group.visible = false;
  }
  sceneElement.classList.remove('is-ready');
  sceneElement.classList.remove('is-revealed', 'is-defeat', 'is-suspense');
  sceneElement.hidden = true;
  if (state.outcome === 'defeat') {
    const movement = applyMovement({
      state: gameState,
      teamId: state.teamId,
      delta: state.fallbackHouse - state.team.houseId,
      reason: 'CENTRAL_NEXUS_FAILURE',
      activateDestination: false
    });
    if (!movement.ok) {
      console.error('Falha ao retornar à Casa 58 após a cena da Casa 60.', movement.reason);
      return;
    }
    synchronizeTeamPieces();
    pushHistory(`${state.team.name} retornou à Casa 58 // PROVA FINAL NÃO CONCLUÍDA`);
    if (!beginFinalizing(gameState)) {
      console.error('Não foi possível finalizar o turno após a derrota na Casa 60.');
      return;
    }
    const advanced = finishTurn(gameState);
    if (advanced && gameState.phase === 'RESOLVING_HOUSE') openHouseAction(team(gameState).houseId);
    returnToMap();
    updateGameHud();
    return;
  }
  if (finish && !gameState.finished) finishFinalWindow(gameState, { force: true });
  if (finish) {
    showFinalStandings();
    updateGameHud();
    return;
  }
  if (gameState.phase === 'RESOLVING_HOUSE') {
    if (!beginFinalizing(gameState)) {
      console.error('Não foi possível finalizar o turno após a apresentação de vitória.');
      return;
    }
    const advanced = finishTurn(gameState);
    if (advanced && gameState.phase === 'RESOLVING_HOUSE') openHouseAction(team(gameState).houseId);
  }
  returnToMap();
  updateGameHud();
}

function showFinalChallengeScene({ rankingEntry = null, answeringTeam, action, correct }) {
  const piece = answeringTeam?.piece;
  if (!answeringTeam || !piece) {
    console.error('Não foi possível abrir a cena da Casa 60 sem a gangue que respondeu.');
    return;
  }
  const sceneElement = document.querySelector('#victory-scene');
  const parent = piece.group.parent;
  const parentIndex = parent.children.indexOf(piece.group);
  const basePosition = piece.group.position.clone();
  const baseRotation = piece.group.rotation.clone();
  const baseScale = piece.group.scale.clone();
  const stageRig = new THREE.Group();
  const boardViewYaw = Math.atan2(camera.position.x - basePosition.x, camera.position.z - basePosition.z);
  const stageViewYaw = Math.atan2(0, 11.5);
  const portrait = pawnPortraits.get(answeringTeam.id);
  const savedCameraState = {
    mode: cameraState.mode,
    houseId: cameraState.houseId,
    progress: cameraState.progress,
    focusPosition: cameraState.focusPosition.clone(),
    focusTarget: cameraState.focusTarget.clone(),
    focusOccluders: new Set(cameraState.focusOccluders)
  };
  const isLastVictory = Boolean(correct && rankingEntry?.order >= 3);
  const message = correct
    ? `A GANGUE ${answeringTeam.name} CONSEGUIU HACKEAR O SISTEMA NEXUS.`
    : 'Você terá que voltar para a Casa 58.';
  const roots = scene.children
    .filter(object => object !== camera && !object.isLight)
    .map(object => ({ object, visible: object.visible }));
  victorySceneState = {
    piece,
    stageRig,
    team: answeringTeam,
    teamId: answeringTeam.id,
    outcome: correct ? 'victory' : 'defeat',
    fallbackHouse: Number(action.config?.fallbackHouse ?? 58),
    parent,
    parentIndex,
    basePosition,
    baseRotation,
    baseScale,
    pieceVisible: piece.group.visible,
    portrait,
    portraitVisible: portrait?.group.visible ?? false,
    roots,
    sceneBackground: scene.background,
    sceneFog: scene.fog,
    cameraPosition: camera.position.clone(),
    cameraQuaternion: camera.quaternion.clone(),
    cameraFov: camera.fov,
    cameraState: savedCameraState,
    targetFov,
    stageYawOffset: stageViewYaw - boardViewYaw,
    startedAt: clock.elapsedTime,
    phase: 'blackout',
    timers: [],
    typingIntervals: new Map(),
    isLastVictory
  };
  document.querySelector('.city-shell').classList.add('is-final-cinematic');
  roots.forEach(({ object }) => {
    object.visible = false;
  });
  parent.remove(piece.group);
  scene.add(stageRig);
  stageRig.add(piece.group);
  piece.group.position.set(0, 0, 0);
  piece.group.scale.copy(baseScale);
  piece.group.rotation.copy(baseRotation);
  stageRig.rotation.y = victorySceneState.stageYawOffset;
  piece.group.visible = true;
  if (portrait) portrait.group.visible = false;
  scene.background = new THREE.Color(0x000000);
  scene.fog = null;
  cameraState.mode = 'VICTORY_CINEMATIC';
  victorySceneState.cameraTarget = new THREE.Vector3(0, 2.5, 11.5);
  victorySceneState.cameraLookAt = new THREE.Vector3(0, 1.15, 0);
  victorySceneState.targetCameraFov = 35;
  victorySceneState.phaseStartedAt = clock.elapsedTime;
  targetFov = 35;

  document.querySelector('#action-popup').hidden = true;
  document.querySelector('#victory-rank').textContent = '';
  document.querySelector('#victory-title').textContent = '';
  document.querySelector('#victory-title').className = '';
  document.querySelector('#victory-message').textContent = '';
  document.querySelector('#victory-team').textContent = '';
  const continueButton = document.querySelector('#victory-continue');
  const finishButton = document.querySelector('#victory-finish');
  continueButton.hidden = correct && isLastVictory;
  continueButton.textContent = correct ? 'CONTINUAR JOGO' : 'CONTINUAR';
  finishButton.hidden = !correct;
  finishButton.textContent = 'TERMINAR JOGO';
  continueButton.onclick = () => closeVictoryScene();
  finishButton.onclick = () => closeVictoryScene({ finish: true });
  sceneElement.classList.remove('is-ready');
  sceneElement.classList.remove('is-revealed', 'is-defeat', 'is-suspense');
  sceneElement.classList.add('is-suspense');
  sceneElement.hidden = false;

  const suspenseQuestion = 'Será que você conseguiu invadir o sistema NEXUS?';
  const revealPawn = () => {
    sceneElement.classList.add('is-revealed');
    sceneElement.classList.remove('is-suspense');
    if (!correct) sceneElement.classList.add('is-defeat');
    victorySceneState.phase = correct ? 'celebrating' : 'falling';
    victorySceneState.phaseStartedAt = clock.elapsedTime;
    scheduleVictoryScene(() => {
      const titleElement = document.querySelector('#victory-title');
      titleElement.className = correct ? 'is-success' : 'is-failure';
      titleElement.textContent = '';
      const title = correct ? 'VOCÊ CONSEGUIU.' : 'Não foi possível hackear o sistema NEXUS.';
      typeVictoryText(titleElement, title, 0);
      if (correct && rankingEntry) {
        const rankLabel = ['PRIMEIRO', 'SEGUNDO', 'TERCEIRO'][rankingEntry.order - 1] ?? `${rankingEntry.order}º`;
        document.querySelector('#victory-rank').textContent =
          `[${String(rankingEntry.order).padStart(2, '0')}] ${rankLabel} LUGAR`;
        document.querySelector('#victory-team').textContent = answeringTeam.name;
      }
      scheduleVictoryScene(() => {
        const messageElement = document.querySelector('#victory-message');
        messageElement.classList.toggle('is-failure', !correct);
        typeVictoryText(messageElement, message, 0);
        scheduleVictoryScene(() => sceneElement.classList.add('is-ready'), 1700);
      }, Math.max(750, title.length * 24));
    }, 450);
  };

  scheduleVictoryScene(() => {
    victorySceneState.phase = 'question';
    victorySceneState.phaseStartedAt = clock.elapsedTime;
    typeVictoryText(document.querySelector('#victory-title'), suspenseQuestion, 0, 65);
    scheduleVictoryScene(() => {
      const suspenseTitle = document.querySelector('#victory-title');
      clearVictoryText(suspenseTitle);
      suspenseTitle.classList.add('is-suspense-dots');
      victorySceneState.phase = 'dots';
      victorySceneState.phaseStartedAt = clock.elapsedTime;
      suspenseTitle.textContent = '.';
      scheduleVictoryScene(() => {
        suspenseTitle.textContent = '..';
        scheduleVictoryScene(() => {
          suspenseTitle.textContent = '...';
          requestAnimationFrame(revealPawn);
        }, 2000);
      }, 2000);
    }, suspenseQuestion.length * 65 + 4500);
  }, 550);
}

function startFinalWindowTimer() {
  if (!gameState.finalWindow?.active || gameState.finished || finalWindowTimerId !== null) return;
  let previousTime = performance.now();
  finalWindowTimerId = setInterval(() => {
    const now = performance.now();
    if (!gameState.paused) {
      gameState.finalWindow.remainingMs = Math.max(0,
        gameState.finalWindow.remainingMs - (now - previousTime));
    }
    previousTime = now;
    const remainingSeconds = Math.ceil(gameState.finalWindow.remainingMs / 1000);
    statusMessage.textContent = `FINALISTA DETECTED // JANELA FINAL ${remainingSeconds}s`;
    if (gameState.finalWindow.remainingMs > 0) return;
    stopFinalWindowTimer();
    const rankedTeamIds = new Set(gameState.finalRanking.map(entry => entry.teamId));
    if (!gameState.teams.every(item => rankedTeamIds.has(item.id))) {
      gameState.finalWindow.active = false;
      gameState.finalWindow.remainingMs = 0;
      statusMessage.textContent = 'REDE ATIVA // PROVA FINAL EM ANDAMENTO';
      updateGameHud();
      return;
    }
    const startingPositions = new Map(gameState.teams.map(item => [item.id, item.houseId]));
    if (gameState.finalChallenge?.status === 'ACTIVE') {
      const challenger = gameState.teams.find(item => item.id === gameState.finalChallenge.teamId);
      if (challenger) {
        const movement = applyMovement({
          state: gameState,
          teamId: challenger.id,
          delta: 58 - challenger.houseId,
          reason: 'FINAL_WINDOW_TIMEOUT',
          activateDestination: false
        });
        if (!movement.ok) {
          console.error('Não foi possível aplicar o retorno após o fim da janela final.', movement);
        }
      }
    }
    const finishWindow = () => {
      stopQuestionTimer();
      if (finishFinalWindow(gameState)) showFinalStandings();
      updateGameHud();
    };
    if (!animateChangedTeamPositions(startingPositions, finishWindow, gameState.phase)) {
      finishWindow();
    }
  }, 100);
}

function renderCodeBlock(code, container, content) {
  const normalizedCode = typeof code === 'string' ? code.replaceAll('\\n', '\n') : '';
  content.replaceChildren();
  if (!normalizedCode) {
    container.hidden = true;
    container.removeAttribute('aria-label');
    return;
  }

  const keywords = new Set(['if', 'elif', 'else', 'and', 'or', 'not', 'True', 'False']);
  const builtins = new Set(['print', 'input', 'len', 'int', 'float', 'str', 'bool']);
  const tokenPattern = /(#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|[A-Za-z_]\w*|\/\/|==|!=|>=|<=|\*\*|[+\-*/%=<>:])/gm;
  let cursor = 0;
  let match;
  while ((match = tokenPattern.exec(normalizedCode)) !== null) {
    if (match.index > cursor) content.append(document.createTextNode(normalizedCode.slice(cursor, match.index)));
    const token = match[0];
    const span = document.createElement('span');
    span.textContent = token;
    if (token.startsWith('#')) span.className = 'code-token-comment';
    else if (/^["']/.test(token)) span.className = 'code-token-string';
    else if (/^\d/.test(token)) span.className = 'code-token-number';
    else if (keywords.has(token)) span.className = 'code-token-keyword';
    else if (builtins.has(token)) span.className = 'code-token-builtin';
    else if (/^[A-Za-z_]/.test(token)) span.className = 'code-token-identifier';
    else span.className = 'code-token-operator';
    content.append(span);
    cursor = tokenPattern.lastIndex;
  }
  if (cursor < normalizedCode.length) content.append(document.createTextNode(normalizedCode.slice(cursor)));
  container.hidden = false;
  container.setAttribute('aria-label', 'Código da pergunta');
}

function getIncorrectAnswerHouse(houseId) {
  if (houseId === 59 || houseId === 60) return 58;
  return houseId;
}

function openFrozenEscapeProtocol() {
  const current = team(gameState);
  const selection = selectQuestion({ state: gameState, difficulty: 'medium' });
  if (!selection.question) {
    resolveFrozenEscape(gameState, { correct: false });
    beginFinalizing(gameState);
    updateGameHud();
    return;
  }
  registerQuestionUse(gameState, selection.question.id);
  gameState.action = {
    type: 'FROZEN_ESCAPE',
    status: 'READY',
    question: selection.question,
    timeLimit: null
  };
  openHouseAction(current.houseId, gameState.action);
}

function openVirusInjectionProtocol() {
  const current = team(gameState);
  const selection = selectQuestion({ state: gameState, difficulty: 'medium' });
  if (!selection.question) {
    console.error('Não há pergunta média disponível para remover VIRUS_INJECTION.');
    gameState.phase = 'PREPARING';
    pushHistory(`${current.name} mantém o VÍRUS // dado limitado a 3`);
    updateGameHud();
    return;
  }
  registerQuestionUse(gameState, selection.question.id);
  gameState.action = {
    type: 'VIRUS_INJECTION_ESCAPE',
    status: 'READY',
    question: selection.question,
    timeLimit: null
  };
  openHouseAction(current.houseId, gameState.action);
}

function openHouseAction(houseId, forcedAction = null) {
  if (houseId === 60 && !forcedAction) {
    const stageNumber = gameState.finalProtocol?.status === 'ACTIVE' &&
      gameState.finalProtocol.teamId === team(gameState)?.id &&
      Number.isInteger(gameState.finalProtocol.stage)
      ? gameState.finalProtocol.stage
      : 1;
    renderFinalProtocolNarrative(stageNumber);
    return;
  }
  if (houseId !== 60 && !forcedAction && gameState.phase === 'RESOLVING_HOUSE') {
    const explanation = getHouseExplanation(getHouse(houseId));
    if (explanation) {
      pendingHouseExplanationId = houseId;
      renderHouseExplanation(houseId, explanation);
      return;
    }
  }
  renderResolvedHouseAction(houseId, forcedAction);
}

function renderFinalProtocolNarrative(stageNumber) {
  const stage = getHouse(60)?.config?.protocolStages?.find(item => item.number === stageNumber);
  if (!stage) {
    console.error(`Narrativa indisponível para a etapa ${stageNumber} da Casa 60.`);
    renderResolvedHouseAction(60);
    return;
  }
  pendingFinalProtocolNarrativeStage = stage.number;
  pendingHouseExplanationId = 60;
  renderHouseExplanation(
    60,
    {
      title: stage.label,
      description: stage.challenge,
      continueLabel: 'PROSSEGUIR'
    },
    { preserveDescription: true }
  );
}

function clearRandomRoulette() {
  if (randomRouletteTimeoutId !== null) {
    window.clearTimeout(randomRouletteTimeoutId);
    randomRouletteTimeoutId = null;
  }
  pendingRandomResolution = null;
}

function renderHouseExplanation(houseId, explanation, { preserveDescription = false } = {}) {
  clearRandomRoulette();
  pendingDoubleDiceRoll = null;
  clearDoubleDiceVisual();
  stopQuestionTimer();
  const popup = document.querySelector('#action-popup');
  const title = document.querySelector('#action-title');
  const prompt = document.querySelector('#action-prompt');
  const options = document.querySelector('#action-options');
  const feedback = document.querySelector('#action-feedback');
  const continueButton = document.querySelector('#close-action');
  popup.querySelector('.action-activation-banner')?.remove();
  popup.querySelector('.hack-activation-display')?.remove();
  popup.classList.remove('is-hack-activation', 'is-event-activation');
  popup.classList.remove('is-hack-speed', 'is-hack-shield', 'is-hack-intercept', 'is-hack-override');
  document.querySelector('#action-type').textContent = 'CASA ESPECIAL';
  const titleText = `CASA ${String(houseId).padStart(2, '0')} // ${explanation.title}`;
  const houseTimeLimit = getHouse(houseId)?.config?.timeLimit;
  const explanationText = explanation.description;
  title.textContent = titleText;
  title.setAttribute('aria-label', titleText);
  prompt.classList.add('is-house-explanation');
  const firstSentenceEnd = explanationText.search(/[.!?](?:\s|$)/);
  const firstSentence = firstSentenceEnd >= 0
    ? explanationText.slice(0, firstSentenceEnd)
    : explanationText;
  const remainingText = firstSentenceEnd >= 0
    ? explanationText.slice(firstSentenceEnd + 1).trim()
    : '';
  const naturalFirstSentence = firstSentence
    .replace(/\bAcerto:\s*/gi, 'Se acertar, ')
    .replace(/\bErro ou tempo esgotado:\s*/gi, 'Se errar ou o tempo acabar, ')
    .replace(/\bErro:\s*/gi, 'Se errar, ')
    .trim();
  const timedFirstSentence = Number.isInteger(houseTimeLimit) && houseTimeLimit > 0
    ? `${naturalFirstSentence} em até ${houseTimeLimit} segundos.`
    : `${naturalFirstSentence}.`;
  const formattedExplanation = preserveDescription
    ? explanationText
    : [timedFirstSentence, remainingText]
    .filter(Boolean)
    .join(' ')
    .replace(/\bAcerto:\s*/gi, 'Se acertar, ')
    .replace(/\bErro ou tempo esgotado:\s*/gi, 'Se errar ou o tempo acabar, ')
    .replace(/\bErro:\s*/gi, 'Se errar, ');
  const rouletteExplanation = houseId === 27 || houseId === 53;
  prompt.textContent = rouletteExplanation
    ? 'Uma roleta será girada e um dos resultados abaixo será sorteado:'
    : formattedExplanation;
  prompt.setAttribute('aria-label', rouletteExplanation
    ? 'Uma roleta será girada e um dos resultados abaixo será sorteado.'
    : formattedExplanation);
  if (rouletteExplanation) {
    const outcomes = [
      ['+3 CASAS', 'avance 3 casas.'],
      ['-2 CASAS', 'recue 2 casas.'],
      ['+1 HACK', 'ganhe 1 HACK.'],
      ['DESAFIO', 'responda uma pergunta de Python.'],
      ['EVENTO GLOBAL', 'um evento global será ativado.'],
      ['NADA', 'nada acontece.']
    ];
    const list = document.createElement('ul');
    list.className = 'roulette-explanation-list';
    outcomes.forEach(([label, detail]) => {
      const item = document.createElement('li');
      const strong = document.createElement('strong');
      strong.textContent = label;
      item.append(strong, document.createTextNode(` — ${detail}`));
      list.append(item);
    });
    prompt.replaceChildren(document.createTextNode('Uma roleta será girada e um dos resultados abaixo será sorteado:'), list);
  }
  renderCodeBlock(null, document.querySelector('#action-code'), document.querySelector('#action-code-content'));
  options.replaceChildren();
  feedback.replaceChildren();
  feedback.hidden = true;
  feedback.className = 'action-feedback';
  continueButton.textContent = explanation.continueLabel;
  continueButton.disabled = false;
  popup.classList.remove('is-correct', 'is-incorrect', 'is-opening');
  popup.hidden = false;
  const animationId = ++actionTextAnimationId;
  popup.classList.add('is-opening');
  setTimeout(() => {
    decodeActionText(title, titleText, animationId);
    if (!rouletteExplanation) decodeActionText(prompt, formattedExplanation, animationId);
  }, 120);
  setTimeout(() => {
    if (animationId === actionTextAnimationId) popup.classList.remove('is-opening');
  }, 700);
  updateGameHud();
}

function getActionPrompt(action) {
  if (action.interaction === 'DOUBLE_DICE') return '';
  if (action.status === 'PENDING_RANDOM') return 'A ROLETA ESTÁ EM MOVIMENTO // AGUARDE O RESULTADO';
  if (action.type === 'CHECKPOINT') {
    return isNeutralHouse(action.houseId)
      ? getHouseExplanation(getHouse(action.houseId))?.description ?? `${getHouseDisplayName(action.houseId)} // SUA POSIÇÃO PERMANECE.`
      : `PROGRESSO REGISTRADO // ${getHouseDisplayName(action.houseId)}`;
  }
  if (action.type === 'EVENT') {
    const event = professorEvents.find(item => item.id === action.event);
    return event ? `${event.name}\n${event.description}` : localizeActionMessage(action.message);
  }
  if (action.status === 'CHOICE') {
    if (action.type === 'INTERCEPT_TARGET') return 'ESCOLHA UMA GANGUE ADVERSÁRIA QUE TENHA HACKS.';
    if (action.targetIds?.length || action.choices?.some(choice => choice?.targetId)) return 'ESCOLHA UMA GANGUE ADVERSÁRIA.';
    if (action.interaction === 'BETRAYAL') return 'ESCOLHA ENTRE TRAIR OU COOPERAR.';
    if (action.interaction === 'BET') return 'ESCOLHA O TIPO DE APOSTA.';
    if (action.interaction === 'AUCTION') return 'ESCOLHA QUANTAS CASAS QUER APOSTAR.';
    if (action.interaction === 'DOUBT') return 'ESCOLHA COMO QUER RESPONDER.';
  }
  return localizeActionMessage(action.message ?? 'A MECÂNICA DA CASA FOI RESOLVIDA.');
}

function localizeActionMessage(message) {
  let localized = String(message);
  const labels = {
    NETWORK_OVERLOAD: 'SOBRECARGA DA REDE',
    BLACKOUT: 'APAGÃO',
    NETWORK_TURBO: 'TURBO DE REDE',
    GLOBAL_VIRUS: 'VÍRUS GLOBAL',
    POSITION_SWAP: 'TROCA DE POSIÇÃO',
    CATCH_UP: 'ALCANCE',
    'POSITION SWAP': 'TROCA DE POSIÇÃO',
    'CATCH UP': 'ALCANCE',
    'SYSTEM GLITCH': 'FALHA DO SISTEMA',
    HACK_RECEBIDO: 'HACK RECEBIDO',
    STATUS_ATIVO: 'STATUS ATIVO',
    EVENTO_GLOBAL: 'EVENTO GLOBAL',
    TELEPORT: 'TELETRANSPORTE',
    RANDOM: 'SORTEIO',
    SURGE: 'AVANÇO',
    BACKFLOW: 'RECUO',
    JUMP: 'SALTO',
    DRIFT: 'DESVIO',
    HACK: 'HACK',
    CHALLENGE: 'DESAFIO SURPRESA',
    GLOBAL_EVENT: 'EVENTO GLOBAL',
    NOTHING: 'SEM EFEITO',
    'ROTA LIBERADA': 'IMPULSO LIBERADO',
    'MOVIMENTO AUTÔNOMO': 'AVANÇO AUTOMÁTICO',
    'SEM GANGUE À FRENTE': 'NENHUMA GANGUE À FRENTE',
    FALLBACK: 'EFEITO ALTERNATIVO'
  };
  Object.entries(labels).forEach(([key, value]) => {
    localized = localized.replaceAll(key, value);
  });
  return localized;
}

function renderRandomRoulette(container, action, continueButton) {
  const outcomes = Array.isArray(action.config?.outcomes) ? action.config.outcomes : [];
  const selectedOutcome = action.randomOutcome;
  const totalWeight = outcomes.reduce((total, outcome) => total + Math.max(0, Number(outcome.weight) || 0), 0);
  const selectedIndex = outcomes.findIndex(outcome => outcome.id === selectedOutcome?.id);
  if (!outcomes.length || totalWeight <= 0 || selectedIndex < 0) {
    pendingRandomResolution = null;
    beginFinalizing(gameState);
    continueButton.disabled = false;
    return false;
  }

  let passedWeight = 0;
  const colors = ['#4ee6e4', '#ff5f7d', '#e6a85e', '#b48cff', '#7bffb1', '#4e8dff'];
  const stops = outcomes.map((outcome, index) => {
    const weight = Math.max(0, Number(outcome.weight) || 0);
    const start = (passedWeight / totalWeight) * 360;
    passedWeight += weight;
    const end = (passedWeight / totalWeight) * 360;
    return `${colors[index % colors.length]} ${start}deg ${end}deg`;
  });
  const selectedWeight = Math.max(0, Number(outcomes[selectedIndex].weight) || 0);
  const weightBeforeSelection = outcomes
    .slice(0, selectedIndex)
    .reduce((total, outcome) => total + Math.max(0, Number(outcome.weight) || 0), 0);
  const selectedMidpoint = (weightBeforeSelection + selectedWeight / 2) / totalWeight * 360;
  const wheel = document.createElement('div');
  wheel.className = 'random-roulette-wheel';
  wheel.style.background = `conic-gradient(${stops.join(', ')})`;
  wheel.style.setProperty('--roulette-target', `${1800 - selectedMidpoint}deg`);
  wheel.setAttribute('aria-label', `Roleta com os resultados possíveis da Casa ${action.houseId}`);
  const marker = document.createElement('span');
  marker.className = 'random-roulette-marker';
  marker.setAttribute('aria-hidden', 'true');
  const result = document.createElement('strong');
  result.className = 'random-roulette-result';
  result.textContent = 'SORTEANDO...';
  const legend = document.createElement('div');
  legend.className = 'random-roulette-legend';
  outcomes.forEach((outcome, index) => {
    const item = document.createElement('span');
    item.textContent = `${localizeActionMessage(outcome.id)} // ${Number(outcome.weight) || 0}`;
    item.style.setProperty('--roulette-color', colors[index % colors.length]);
    legend.append(item);
  });
  const stage = document.createElement('div');
  stage.className = 'random-roulette-stage';
  stage.append(wheel, marker);
  container.replaceChildren(stage, legend, result);
  continueButton.disabled = true;
  continueButton.textContent = 'AGUARDE A ROLETA';
  pendingRandomResolution = { houseId: action.houseId, outcome: selectedOutcome };
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 40 : 2500;
  requestAnimationFrame(() => wheel.classList.add('is-spinning'));
  randomRouletteTimeoutId = window.setTimeout(() => {
    randomRouletteTimeoutId = null;
    if (!pendingRandomResolution || document.querySelector('#action-popup').hidden) return;
    result.textContent = `RESULTADO // ${localizeActionMessage(selectedOutcome.id)}`;
    wheel.setAttribute('aria-label', `Resultado sorteado: ${localizeActionMessage(selectedOutcome.id)}`);
    continueButton.disabled = false;
    continueButton.textContent = 'PROSSEGUIR';
  }, duration);
  return true;
}

function isTargetChoice(action, index) {
  return action.type === 'INTERCEPT_TARGET' ||
    Boolean(action.choices?.[index] && typeof action.choices[index] === 'object' && action.choices[index].targetId);
}

function renderHouseChoices(container, action) {
  container.classList.remove('has-gang-targets');
  let hasTargets = false;
  action.choices.forEach((choice, index) => {
    const targetId = action.type === 'INTERCEPT_TARGET'
      ? action.interceptTargets[index]
      : typeof choice === 'object' ? choice.targetId : null;
    const target = targetId ? gameState.teams.find(item => item.id === targetId) : null;
    if (target) {
      if (target.id === team(gameState).id) return;
      hasTargets = true;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gang-target-option';
      button.dataset.choice = String(index);
      button.dataset.targetId = target.id;
      button.style.setProperty('--gang-color', `#${Number(target.color).toString(16).padStart(6, '0').slice(-6)}`);
      const portrait = document.createElement('img');
      portrait.src = new URL(`./assets/characters/portraits/${portraitFiles[target.character]}`, import.meta.url).href;
      portrait.alt = '';
      portrait.loading = 'lazy';
      const name = document.createElement('strong');
      name.textContent = target.name;
      const protectedByFirewall = isProtectedByFirewall(
        gameState,
        action.type === 'INTERCEPT_TARGET' ? 'INTERCEPTAR' : action.interaction,
        target.id
      );
      if (protectedByFirewall) {
        button.classList.add('is-firewall-protected');
        button.disabled = true;
        button.title = 'PROTEGIDA PELO FIREWALL';
        button.setAttribute('aria-label', `${target.name} — PROTEGIDA PELO FIREWALL`);
        const protection = document.createElement('span');
        protection.className = 'firewall-target-tooltip';
        protection.textContent = 'PROTEGIDA PELO FIREWALL';
        button.append(protection);
      }
      button.append(portrait, name);
      container.append(button);
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.choice = String(index);
    const choiceId = typeof choice === 'object' ? choice.id : choice;
    const choiceName = typeof choice === 'object' ? choice.name : choice;
    const label = action.interaction === 'AUCTION'
      ? `${choice.effect?.amount ?? choice.id.replace('BET_', '')} CASA(S)`
      : action.interaction === 'DOUBLE_DICE' && choiceId === 'OVERCLOCK'
        ? 'ARRISCAR // 1–2: -2 CASAS; 3–4: 0; 5–6: +3 CASAS'
      : getChoiceDisplayName(choiceId, choiceName);
    button.textContent = `${index + 1}. ${label}`;
    container.append(button);
  });
  if (hasTargets) {
    container.classList.add('has-gang-targets');
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'confirm-target-button';
    confirm.dataset.confirmTarget = 'true';
    confirm.disabled = true;
    confirm.textContent = 'CONFIRMAR GANGUE';
    container.append(confirm);
  }
}

function renderResolvedHouseAction(houseId, forcedAction = null) {
  if (!forcedAction && gameState.phase !== 'RESOLVING_HOUSE') return;
  clearRandomRoulette();
  pendingQuestionConsequence = null;
  clearDoubleDiceVisual();
  stopQuestionTimer();
  const interactionToken = ++questionInteractionToken;
  const startingPositions = new Map(gameState.teams.map(item => [item.id, item.houseId]));
  const action = forcedAction ?? resolveHouse(gameState, houseId);
  if (!forcedAction && animateChangedTeamPositions(
    startingPositions,
    () => renderResolvedHouseAction(houseId, action),
    gameState.phase
  )) return;
  if (action.challengeMode === 'CRITICAL_BUG') action.challengeCode = action.question?.code ?? null;
  const answeringTeam = team(gameState);
  const popup = document.querySelector('#action-popup');
  const continueButton = document.querySelector('#close-action');
  const title = document.querySelector('#action-title');
  const codeWindow = document.querySelector('#action-code');
  const codeContent = document.querySelector('#action-code-content');
  const actionLabels = {
    QUESTION: 'PERGUNTA',
    ALTERNATIVES: 'ALTERNATIVAS',
    HACK: 'HACK',
    EVENT: 'EVENTO',
    CHALLENGE: 'DESAFIO',
    FALLBACK: 'SISTEMA'
  };
  const actionLabel = action.interaction
    ? getInteractionDisplayName(action.interaction, actionLabels[action.type] ?? 'INTERAÇÃO')
    : getInteractionDisplayName(action.type, actionLabels[action.type] ?? 'AÇÃO DA CASA');
  document.querySelector('#action-type').textContent = actionLabel;
  popup.querySelector('.action-activation-banner')?.remove();
  popup.querySelector('.hack-activation-display')?.remove();
  popup.classList.remove('is-hack-activation', 'is-event-activation');
  popup.classList.remove('is-hack-speed', 'is-hack-shield', 'is-hack-intercept', 'is-hack-override');
  if (action.type === 'EVENT') {
    const banner = document.createElement('div');
    banner.className = 'action-activation-banner';
    banner.textContent = 'EVENTO GLOBAL // ATIVO';
    popup.querySelector('.action-card').insertBefore(banner, document.querySelector('#action-prompt'));
    popup.classList.add('is-event-activation');
  } else if (action.type === 'INTERCEPT_TARGET') {
    const banner = document.createElement('div');
    banner.className = 'action-activation-banner';
    banner.append(createHackIcon('INTERCEPTAR', 'hack-action-icon'));
    const bannerText = document.createElement('span');
    bannerText.textContent = 'HACK // INTERCEPTAR';
    banner.append(bannerText);
    popup.querySelector('.action-card').insertBefore(banner, document.querySelector('#action-prompt'));
    popup.classList.add('is-hack-activation');
    popup.classList.add('is-hack-intercept');
  }
  const protocolTitle = action.questionResolution === 'FINAL_CHALLENGE'
    ? ` // FINAL PROTOCOL ${action.finalProtocolStage ?? 1}/${action.finalProtocolTotal ?? 3}`
    : '';
  const titleText = `CASA ${String(houseId).padStart(2, '0')} // ${getHouseDisplayName(houseId, actionLabel)}${protocolTitle}`;
  title.textContent = titleText;
  const prompt = document.querySelector('#action-prompt');
  const timerElement = document.querySelector('#action-timer');
  prompt.classList.toggle('is-house-explanation', action.interaction === 'DOUBLE_DICE');
  prompt.classList.toggle('is-event-result', action.type === 'EVENT');
  const options = document.querySelector('#action-options');
  options.classList.remove('has-gang-targets');
  const feedback = document.querySelector('#action-feedback');
  popup.classList.remove('is-correct', 'is-incorrect', 'is-opening');
  title.removeAttribute('aria-label');
  prompt.removeAttribute('aria-label');
  feedback.className = 'action-feedback';
  feedback.replaceChildren();
  feedback.hidden = true;
  const manualNetworkSelection = action.interaction === 'SPEED_NETWORK_FIRST' &&
    action.manualFirstResponder === true;
  const hasQuestion = Boolean(action.question) && !manualNetworkSelection;
  const hasChoice = action.status === 'CHOICE' && Array.isArray(action.choices);
  const multiplayer = ['JUDGEMENT', 'SPEED_BATTLE', 'SPEED_NETWORK'].includes(action.interaction);
  const collectResponses = multiplayer || action.collectResponses === true;
  const responseParticipants = action.participantIds ?? action.participants ?? [];
  const questionText = hasQuestion
    ? `${action.respondentId && !collectResponses
        ? `RESPOSTA DE ${gameState.teams.find(item => item.id === action.respondentId)?.name ?? 'GANGUE ALVO'}\n`
        : ''}${action.questions?.length
          ? `MINIQUESTÃO 1/${action.questions.length}\n${action.challengeMode === 'CRITICAL_BUG' ? `${action.question.question}\n${action.questions[0].question}` : action.questions[0].question}`
          : action.question.question}`
    : manualNetworkSelection
      ? 'QUAL GANGUE RESPONDEU PRIMEIRO?'
      : getActionPrompt(action);
  prompt.textContent = questionText;
  timerElement.hidden = true;
  timerElement.textContent = '';
  renderCodeBlock(
    hasQuestion
      ? action.challengeMode === 'CRITICAL_BUG' ? action.challengeCode : action.question.code
      : null,
    codeWindow,
    codeContent
  );
  continueButton.disabled = hasQuestion || hasChoice;
  continueButton.textContent = 'CONTINUAR';
  options.replaceChildren();
  if (collectResponses) {
    const note = document.createElement('p');
    note.className = 'action-multiplayer-note';
    note.textContent = action.interaction === 'ALLIANCE' || (action.interaction === 'DOUBT' && action.mode === 'HELP')
      ? 'AS DUAS GANGUES RESPONDEM. O BÔNUS SÓ É APLICADO SE AMBAS ACERTAREM.'
      : multiplayer
        ? action.interaction === 'SPEED_NETWORK_FIRST'
          ? 'REGISTRE A RESPOSTA DE CADA GANGUE. DEPOIS, SELECIONE QUEM RESPONDEU PRIMEIRO.'
          : 'REGISTRE A RESPOSTA DE CADA GANGUE. A ORDEM DOS ACERTOS DEFINE O RESULTADO.'
        : 'REGISTRE A RESPOSTA DE CADA PARTICIPANTE.';
    options.append(note);
    responseParticipants.forEach(participantId => {
      const participant = gameState.teams.find(item => item.id === participantId);
      const row = document.createElement('div');
      row.className = 'multiplayer-response';
      const name = document.createElement('strong');
      name.textContent = participant?.name ?? participantId;
      row.append(name);
      [['correct', 'ACERTO'], ['wrong', 'ERRO'], ['timeout', 'TEMPO ESGOTADO']].forEach(([result, label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.mpTeam = participantId;
        button.dataset.mpResult = result;
        button.textContent = label;
        row.append(button);
      });
      options.append(row);
    });
  } else if (hasQuestion) {
    action.question.options.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.answer = String(index);
      button.textContent = `${index + 1}. ${option}`;
      options.append(button);
    });
  } else if (hasChoice) {
    renderHouseChoices(options, action);
  }
  if (gameState.phase === 'RESOLVING_HOUSE' &&
      canOverrideAction(action) &&
      canUseHack(answeringTeam, 'OVERRIDE', gameState)) {
    const overrideButton = document.createElement('button');
    overrideButton.type = 'button';
    overrideButton.className = 'override-modal-action';
    overrideButton.dataset.overrideAction = 'true';
    overrideButton.append(createHackIcon('OVERRIDE', 'hack-action-icon'));
    overrideButton.append(document.createTextNode('USAR OVERRIDE // CANCELAR EFEITO'));
    overrideButton.addEventListener('click', runOverrideHack);
    options.append(overrideButton);
  }
  if (action.status === 'PENDING_RANDOM') {
    renderRandomRoulette(options, action, continueButton);
  } else if (!hasQuestion && !hasChoice && !manualNetworkSelection) {
    beginFinalizing(gameState);
  }
  let questionResolved = !hasQuestion && !hasChoice && !manualNetworkSelection;
  let selectedTargetChoiceIndex = null;
  const renderPenaltyChoices = penalties => {
    const pending = penalties.filter(penalty =>
      penalty && typeof penalty.teamId === 'string' && Number.isFinite(penalty.amount) &&
      penalty.amount < 0 && isPenaltyCancelable({ ...penalty, houseId })
    );
    if (!pending.length) return false;
    const settled = new Set();
    let shieldAnimationCount = 0;
    const startingPositions = new Map(gameState.teams.map(item => [item.id, item.houseId]));
    const animateShieldReaction = (row, penalized, penaltyRecord) => {
      shieldAnimationCount += 1;
      const display = document.createElement('div');
      display.className = 'shield-reaction-display';
      display.append(createHackIcon('ESCUDO', 'shield-reaction-icon'));
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = 'PENALIDADE BLOQUEADA';
      const detail = document.createElement('span');
      detail.textContent = `ESCUDO ATIVADO // ${penalized.name} // ${penaltyRecord.amount} CASA(S) CANCELADA(S)`;
      copy.append(title, detail);
      display.append(copy);
      row.replaceChildren(display);
      row.classList.add('is-shielded');
      window.setTimeout(() => {
        shieldAnimationCount -= 1;
        finishSettlement();
      }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 40 : 1250);
    };
    const finishSettlement = () => {
      if (settled.size !== pending.length || shieldAnimationCount > 0) return;
      beginFinalizing(gameState);
      continueButton.disabled = false;
      continueButton.textContent = 'PROSSEGUIR';
      updateGameHud();
    };
    const applyPenalty = (penalized, penaltyRecord) => {
      const movement = applyMovement({
        state: gameState,
        teamId: penalized.id,
        delta: penaltyRecord.amount,
        reason: penaltyRecord.reason ?? 'INTERACTION_PENALTY',
        activateDestination: false
      });
      if (movement.ok) {
        pushHistory(`${penalized.name} recuou para a casa ${movement.houseId}`);
      }
    };
    pending.forEach((penaltyRecord, index) => {
      const penalized = gameState.teams.find(item => item.id === penaltyRecord.teamId);
      if (!penalized) {
        settled.add(index);
        return;
      }
      const penaltyAmount = Math.abs(penaltyRecord.amount);
      const canShield = canUseShield(gameState, penalized.id, { ...penaltyRecord, houseId });
      if (!canShield) {
        applyPenalty(penalized, penaltyRecord);
        settled.add(index);
        return;
      }
      const row = document.createElement('div');
      row.className = 'interaction-penalty-choice interaction-penalty-shield-choice';
      const icon = createHackIcon('ESCUDO', 'interaction-penalty-shield-icon');
      const copy = document.createElement('div');
      copy.className = 'interaction-penalty-copy';
      const label = document.createElement('strong');
      label.textContent = 'PENALIDADE RECEBIDA';
      const amount = document.createElement('span');
      amount.textContent = `PENALIDADE: -${penaltyAmount} CASA${penaltyAmount === 1 ? '' : 'S'}`;
      const detail = document.createElement('span');
      detail.className = 'interaction-penalty-detail';
      detail.textContent = `A gangue ${penalized.name} receberá -${penaltyAmount} casa${penaltyAmount === 1 ? '' : 's'}.`;
      const shieldCount = document.createElement('strong');
      shieldCount.className = 'interaction-penalty-shield-count';
      shieldCount.append(createHackIcon('ESCUDO', 'interaction-penalty-count-icon'));
      shieldCount.append(document.createTextNode(` ESCUDO ×${getHackTypeCount(penalized, 'ESCUDO')}`));
      const prompt = document.createElement('span');
      prompt.className = 'interaction-penalty-prompt';
      prompt.textContent = 'USAR ESCUDO PARA CANCELAR?';
      copy.append(label, amount, detail, shieldCount, prompt);
      const actions = document.createElement('div');
      actions.className = 'interaction-penalty-actions';
      const shield = document.createElement('button');
      shield.type = 'button';
      shield.className = 'interaction-penalty-shield-button';
      shield.textContent = 'USAR ESCUDO';
      shield.disabled = !canShield;
      shield.title = canShield
        ? 'Cancela esta penalidade e consome 1 HACK.'
        : gameState.activeEvent === 'BLACKOUT'
          ? 'HACKs bloqueados pelo APAGÃO.'
          : penalized === team(gameState) && gameState.hackUsedThisTurn
              ? 'Esta gangue já usou um HACK neste turno.'
              : !hasHack(penalized, 'ESCUDO')
                ? 'Nenhum ESCUDO disponível para cancelar esta penalidade.'
                : 'Esta penalidade não permite uma reação de ESCUDO fora do turno da gangue.';
      const decline = document.createElement('button');
      decline.type = 'button';
      decline.className = 'interaction-penalty-decline-button';
      decline.textContent = 'NÃO, RECEBER PENALIDADE';
      const settle = useShield => {
        if (settled.has(index) || gameState.moving) return;
        const decision = resolveShield(
          gameState,
          penalized.id,
          { ...penaltyRecord, houseId },
          useShield
        );
        settled.add(index);
        if (!decision.canceled) {
          applyPenalty(penalized, penaltyRecord);
          label.textContent = `${penalized.name} // PENALIDADE APLICADA`;
        } else {
          if (useShield && decision.canceled) {
            animateShieldReaction(row, penalized, penaltyRecord);
          } else {
            label.textContent = `${penalized.name} // PENALIDADE APLICADA`;
          }
        }
        shield.disabled = true;
        decline.disabled = true;
        if (decision.canceled) {
          updateGameHud();
        } else if (!animateChangedTeamPositions(startingPositions, finishSettlement, gameState.phase)) {
          finishSettlement();
        }
      };
      shield.addEventListener('click', () => settle(true));
      decline.addEventListener('click', () => settle(false));
      actions.append(shield, decline);
      row.append(icon, copy, actions);
      options.append(row);
    });
    if (settled.size === pending.length) {
      if (!animateChangedTeamPositions(startingPositions, finishSettlement, gameState.phase)) {
        finishSettlement();
      }
      return true;
    }
    feedback.replaceChildren();
    const feedbackMessage = document.createElement('strong');
    feedbackMessage.textContent = 'ESCUDO DISPONÍVEL';
    feedback.append(feedbackMessage);
    feedback.hidden = false;
    continueButton.disabled = true;
    updateGameHud();
    return true;
  };
  const actionInteractionId = action.interactionId ??
    `${gameState.turn}:${houseId}:${action.interaction ?? action.type}:${answeringTeam.id}`;
  if (collectResponses || action.interaction === 'SPEED_NETWORK_FIRST') {
    if (action.interaction === 'SPEED_NETWORK_FIRST') {
      gameState.interactionResponseLimits ??= {};
      gameState.interactionResponseLimits[actionInteractionId] = 1;
    }
    const started = beginMultiplayerInteraction(gameState, actionInteractionId, responseParticipants);
    if (!started.ok) {
      questionResolved = true;
      feedback.textContent = 'NÃO FOI POSSÍVEL INICIAR A COLETA DE RESPOSTAS.';
      feedback.hidden = false;
      beginFinalizing(gameState);
      continueButton.disabled = false;
      updateGameHud();
    }
    const renderManualNetworkSelection = () => {
      prompt.textContent = 'QUAL GANGUE RESPONDEU PRIMEIRO?';
      prompt.setAttribute('aria-label', prompt.textContent);
      options.replaceChildren();
      continueButton.disabled = true;
      continueButton.textContent = 'SELECIONE A GANGUE';
      const participants = responseParticipants
        .map(participantId => gameState.teams.find(item => item.id === participantId))
        .filter(participant => participant && !participant.finalist);
      const responses = getInteractionResponses(gameState, actionInteractionId);
      participants.forEach(participant => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gang-target-option';
        button.dataset.firstResponder = participant.id;
        button.style.setProperty('--gang-color', `#${Number(participant.color).toString(16).padStart(6, '0').slice(-6)}`);
        const portrait = document.createElement('img');
        portrait.src = new URL(`./assets/characters/portraits/${portraitFiles[participant.character]}`, import.meta.url).href;
        portrait.alt = '';
        portrait.loading = 'lazy';
        const name = document.createElement('strong');
        name.textContent = participant.name;
        button.append(portrait, name);
        button.addEventListener('click', () => {
          if (gameState.paused || gameState.moving || questionResolved) return;
          const selectedResponse = responses[0];
          const interactionResult = resolveInteraction(gameState, {
            type: action.interaction,
            teamId: answeringTeam.id,
            participantIds: responseParticipants,
            interactionId: actionInteractionId
          }, {
            firstTeamId: participant.id,
            responses
          });
          if (!interactionResult.ok) {
            feedback.textContent = 'GANGUE SELECIONADA INVÁLIDA // TENTE NOVAMENTE';
            feedback.hidden = false;
            return;
          }
          questionResolved = true;
          options.querySelectorAll('button').forEach(option => { option.disabled = true; });
          const selectedCorrect = selectedResponse?.result === 'correct';
          feedback.textContent = selectedCorrect
            ? `${participant.name} ACERTOU // +1 CASA`
            : `${participant.name} ERROU // POSIÇÃO MANTIDA`;
          feedback.hidden = false;
          const rewardStartHouse = participant.houseId;
          const finishSelection = () => {
            beginFinalizing(gameState);
            continueButton.disabled = false;
            continueButton.textContent = 'FINALIZAR TURNO';
            updateGameHud();
          };
          if (selectedCorrect && interactionResult.movement?.ok &&
              participant.houseId !== rewardStartHouse &&
              animateResolvedQuestionMovement(
                participant,
                rewardStartHouse,
                'REDE RELÂMPAGO',
                feedback.textContent,
                finishSelection
              )) return;
          finishSelection();
        });
        options.append(button);
      });
      feedback.hidden = false;
      updateGameHud();
    };
    if (manualNetworkSelection) renderManualNetworkSelection();
  }
  const resolveCollectedResponses = () => {
    const responses = getInteractionResponses(gameState, actionInteractionId);
    const startingPositions = new Map(gameState.teams.map(item => [item.id, item.houseId]));
    const result = action.interaction
      ? resolveInteraction(gameState, {
          type: action.interaction,
          teamId: answeringTeam.id,
          targetId: action.targetId,
          mode: action.mode,
          participantIds: responseParticipants,
          requireResponses: true,
          interactionId: actionInteractionId
        }, {
          responses,
          order: getInteractionOrder(gameState, actionInteractionId),
          deferPenalties: true
        })
      : null;
    const presentResult = () => {
        const globalVirusPenalties = gameState.activeEvent === 'GLOBAL_VIRUS'
          ? responses
              .filter(response => response.result !== 'correct')
              .map(response => ({
                teamId: response.teamId,
                amount: -3,
                reason: 'GLOBAL_VIRUS',
                event: true,
                interaction: true
              }))
          : [];
        const penalties = [...(result?.penalties ?? []), ...globalVirusPenalties];
        feedback.textContent = result?.ok
          ? `${getInteractionDisplayName(action.interaction)} RESOLVIDO`
          : action.interaction
            ? 'A INTERAÇÃO NÃO PÔDE SER RESOLVIDA.'
            : `${getInteractionDisplayName(action.type)} RESOLVIDO`;
        feedback.hidden = false;
        if (!result?.ok && action.interaction) console.error('Falha ao resolver interação.', result?.reason);
        if (renderPenaltyChoices(penalties)) return;
        beginFinalizing(gameState);
        continueButton.disabled = false;
        continueButton.textContent = 'FINALIZAR TURNO';
        updateGameHud();
    };
    if (!animateChangedTeamPositions(startingPositions, presentResult, gameState.phase)) {
        presentResult();
    }
  };
  const completeQuestionFlow = () => {
    if (gameState.phase !== 'FINALIZING' && !beginFinalizing(gameState)) {
      console.error('Não foi possível finalizar o turno após o movimento da resposta.');
      return;
    }
    const advanced = finishTurn(gameState);
    if (advanced && gameState.phase === 'RESOLVING_HOUSE') {
      openHouseAction(team(gameState).houseId);
    }
    returnToMap();
    updateGameHud();
  };
  const finishQuestion = (result, selectedButton = null) => {
    if (gameState.finished || questionResolved || interactionToken !== questionInteractionToken) return;
    if (Array.isArray(action.questions) && action.questions.length) {
      const questions = action.questions;
      const currentIndex = action.currentQuestionIndex ?? 0;
      action.multiTotal = questions.length;
      action.multiAnswers ??= [];
      action.question = questions[currentIndex] ?? action.question;
      if (result.result === 'timeout') {
        action.multiScore = action.multiAnswers.filter(Boolean).length;
        action.questions = null;
        action.questionResolution = 'NORMAL';
        action.config = { ...action.config, reward: 0 };
        result = { ...result, correct: false };
      } else {
        action.multiAnswers.push(result.correct);
        if (currentIndex + 1 < questions.length) {
          action.currentQuestionIndex = currentIndex + 1;
          action.question = questions[currentIndex + 1];
          prompt.textContent = `MINIQUESTÃO ${currentIndex + 2}/${questions.length}\n${action.question.question}`;
          renderCodeBlock(
            action.challengeMode === 'CRITICAL_BUG'
              ? action.challengeCode ?? action.question.code
              : action.question.code,
            codeWindow,
            codeContent
          );
          options.querySelectorAll('button[data-answer]').forEach((option, index) => {
            option.disabled = false;
            option.classList.remove('is-correct', 'is-incorrect');
            option.textContent = `${index + 1}. ${action.question.options[index] ?? ''}`;
          });
          feedback.textContent = `RESPOSTA REGISTRADA // ${action.multiAnswers.filter(Boolean).length} CORRETA(S)`;
          feedback.hidden = false;
          return;
        }
        action.multiScore = action.multiAnswers.filter(Boolean).length;
        const reward = Number(action.scoring?.[action.multiScore] ?? 0);
        action.questions = null;
        action.questionResolution = 'NORMAL';
        action.config = { ...action.config, reward };
        result = { ...result, correct: reward > 0, result: reward > 0 ? 'correct' : 'wrong' };
      }
    }
    questionResolved = true;
    stopQuestionTimer();
    options.querySelectorAll('button').forEach(option => {
      option.disabled = true;
      option.classList.remove('is-correct', 'is-incorrect');
    });
    if (action.questionResolution === 'FINAL_CHALLENGE' &&
        action.finalProtocolStage === 3 &&
        gameState.finalChallenge?.teamId === answeringTeam.id &&
        gameState.finalChallenge?.stage === 3) {
      feedback.replaceChildren();
      feedback.hidden = true;
      popup.classList.remove('is-correct', 'is-incorrect', 'is-opening');
      const finalResult = resolveFinalChallenge(gameState, answeringTeam.id, result);
      if (!finalResult.ok) {
        console.error('Não foi possível registrar o resultado da etapa final da Casa 60.', finalResult.reason);
        return;
      }
      if (finalResult.correct) {
        pushHistory(`${answeringTeam.name} concluiu a prova final // ${finalResult.rankingEntry.order}º lugar`);
        statusMessage.textContent = 'FINALISTA DETECTED // JANELA FINAL 60s';
        if (!gameState.finished) startFinalWindowTimer();
      }
      showFinalChallengeScene({
        rankingEntry: finalResult.rankingEntry ?? null,
        answeringTeam,
        action,
        correct: finalResult.correct
      });
      continueButton.disabled = true;
      updateGameHud();
      return;
    }
    if (selectedButton) selectedButton.classList.add(result.correct ? 'is-correct' : 'is-incorrect');
    feedback.replaceChildren();
    const feedbackTitle = document.createElement('strong');
    const feedbackMessage = document.createElement('span');
    feedbackTitle.textContent = action.multiTotal
      ? `${action.multiScore ?? 0}/${action.multiTotal} RESPOSTAS CERTAS`
      : result.result === 'timeout'
        ? 'TEMPO ESGOTADO'
      : result.correct ? 'RESPOSTA CERTA' : 'RESPOSTA ERRADA';
    feedbackMessage.textContent = action.multiTotal
      ? result.result === 'timeout'
        ? 'TEMPO ESGOTADO // DESAFIO INCOMPLETO'
        : `DESAFIO CONCLUÍDO // ${action.multiScore} ACERTO(S)`
      : result.result === 'timeout'
        ? 'A resposta não foi enviada a tempo.'
      : result.correct ? 'VOCÊ ACERTOU!' : 'RESPOSTA INCORRETA.';
    feedback.append(feedbackTitle, feedbackMessage);
    if (!action.multiTotal && !result.correct && Number.isInteger(action.question.answer)) {
      const correctAnswer = action.question.options[action.question.answer];
      if (typeof correctAnswer === 'string') {
        const correctAnswerMessage = document.createElement('p');
        correctAnswerMessage.className = 'action-correct-answer';
        correctAnswerMessage.textContent = `RESPOSTA CORRETA: ${correctAnswer}`;
        feedback.append(correctAnswerMessage);
        options.querySelector(`[data-answer="${action.question.answer}"]`)?.classList.add('is-correct');
      }
    }
    if (typeof action.question.explanation === 'string') {
      const explanation = document.createElement('p');
      explanation.className = 'action-explanation';
      explanation.textContent = action.question.explanation;
      feedback.append(explanation);
    }
    feedback.hidden = false;
    popup.classList.remove('is-correct', 'is-incorrect');
    feedback.classList.toggle('is-correct', result.correct);
    feedback.classList.toggle('is-incorrect', !result.correct);
    popup.classList.add(result.correct ? 'is-correct' : 'is-incorrect');
    if (action.interaction === 'SPEED_NETWORK_FIRST' && !action.manualFirstResponder) {
      const registered = recordInteractionResponse(
        gameState,
        actionInteractionId,
          answeringTeam.id,
        result.result
      );
      if (!registered.accepted) {
        console.error('Não foi possível registrar a resposta da Rede Relâmpago.', registered.reason);
      }
    }
    pendingQuestionConsequence = () => {
    pendingQuestionConsequence = null;
    if (action.interaction === 'SPEED_NETWORK_FIRST' && !action.manualFirstResponder) {
      action.manualFirstResponder = true;
      renderResolvedHouseAction(houseId, action);
      return;
    }
      finishQuestionConsequence(result);
      if (action.questionResolution !== 'FINAL_CHALLENGE' &&
          gameState.phase === 'FINALIZING' &&
          !diceMove &&
          !popup.hidden) {
        popup.hidden = true;
        const advanced = finishTurn(gameState);
        if (advanced && gameState.phase === 'RESOLVING_HOUSE') {
          openHouseAction(team(gameState).houseId);
        }
        returnToMap();
        updateGameHud();
      }
    };
    continueButton.textContent = 'PROSSEGUIR';
    continueButton.disabled = false;
    updateGameHud();
    return;
  };
  const finishQuestionConsequence = result => {
    const feedbackMessage = feedback.querySelector('span');
    if (!feedbackMessage) {
      console.error('O feedback da resposta não contém a mensagem esperada.');
      return;
    }
    if (action.type === 'FROZEN_ESCAPE') {
      const escape = resolveFrozenEscape(gameState, result);
      if (escape.escaped) {
        feedbackMessage.textContent = 'PROTOCOLO DE FUGA // CONGELAMENTO REMOVIDO';
        popup.hidden = true;
        if (gameState.phase === 'RESOLVING_HOUSE' && gameState.action?.houseId === 59) {
          openHouseAction(59);
          updateGameHud();
          return;
        }
        gameState.action = null;
      } else {
        feedbackMessage.textContent = 'FUGA NÃO CONCLUÍDA // TURNO PERDIDO';
        beginFinalizing(gameState);
        continueButton.disabled = false;
      }
      if (!result.correct && gameState.activeEvent === 'GLOBAL_VIRUS') {
        continueButton.disabled = true;
        renderPenaltyChoices([{
          teamId: answeringTeam.id,
          amount: -3,
          reason: 'GLOBAL_VIRUS',
          event: true
        }]);
      }
      updateGameHud();
      return;
    }
    if (action.type === 'VIRUS_INJECTION_ESCAPE') {
      const escape = resolveVirusInjectionEscape(gameState, result);
      feedbackMessage.textContent = escape.escaped
        ? 'VÍRUS REMOVIDO // PRÓXIMO DADO SEM LIMITE'
        : 'VÍRUS MANTIDO // PRÓXIMO DADO LIMITADO A 3';
      pushHistory(escape.escaped
        ? `${answeringTeam.name} removeu VIRUS INJECTION`
        : `${answeringTeam.name} não removeu VIRUS INJECTION`);
      if (gameState.phase === 'RESOLVING_HOUSE' && gameState.action?.houseId === 59) {
        popup.hidden = true;
        openHouseAction(59);
        updateGameHud();
        return;
      }
      gameState.action = null;
      popup.hidden = true;
      updateGameHud();
      return;
    }
    if (action.type === 'VIRUS_INJECTION_CHALLENGE') {
      const target = gameState.teams.find(item => item.id === action.targetId);
      if (result.correct && target) removeStatus(target, 'VIRUS_INJECTION');
      feedbackMessage.textContent = result.correct
        ? 'VÍRUS REMOVIDO // PRÓXIMO DADO SEM LIMITE'
        : 'VÍRUS MANTIDO // PRÓXIMO DADO LIMITADO A 3';
      if (!result.correct && gameState.activeEvent === 'GLOBAL_VIRUS' && target) {
        continueButton.disabled = true;
        if (renderPenaltyChoices([{
          teamId: target.id,
          amount: -3,
          reason: 'GLOBAL_VIRUS',
          event: true,
          interaction: true
        }])) return;
      }
      beginFinalizing(gameState);
      continueButton.disabled = false;
      updateGameHud();
      return;
    }
    if (['SPEED_BATTLE_FIRST', 'SPEED_NETWORK_FIRST', 'DUEL_FIRST'].includes(action.interaction)) {
      prompt.textContent = 'QUAL GANGUE RESPONDEU PRIMEIRO?';
      prompt.setAttribute('aria-label', prompt.textContent);
      options.replaceChildren();
      continueButton.disabled = true;
      continueButton.textContent = 'SELECIONE A GANGUE';
      const participants = (action.participants ?? [])
        .map(participantId => gameState.teams.find(item => item.id === participantId))
        .filter(participant => participant && !participant.finalist);
      participants.forEach(participant => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gang-target-option';
        button.dataset.firstResponder = participant.id;
        button.style.setProperty('--gang-color', `#${Number(participant.color).toString(16).padStart(6, '0').slice(-6)}`);
        const portrait = document.createElement('img');
        portrait.src = new URL(`./assets/characters/portraits/${portraitFiles[participant.character]}`, import.meta.url).href;
        portrait.alt = '';
        portrait.loading = 'lazy';
        const name = document.createElement('strong');
        name.textContent = participant.name;
        button.append(portrait, name);
        const protectedByFirewall = action.interaction === 'DUEL_FIRST' &&
          participant.id !== answeringTeam.id &&
          isProtectedByFirewall(gameState, 'DUEL', participant.id);
        if (protectedByFirewall) {
          button.classList.add('is-firewall-protected');
          button.disabled = true;
          button.title = 'PROTEGIDA PELO FIREWALL';
          button.setAttribute('aria-label', `${participant.name} — PROTEGIDA PELO FIREWALL`);
          const protection = document.createElement('span');
          protection.className = 'firewall-target-tooltip';
          protection.textContent = 'PROTEGIDA PELO FIREWALL';
          button.append(protection);
        }
        button.addEventListener('click', () => {
          if (gameState.paused || gameState.moving) return;
          const selectedTeamId = button.dataset.firstResponder;
          const selectedTeam = participants.find(item => item.id === selectedTeamId);
          const rewardStartHouse = selectedTeam?.houseId;
          const interactionResult = resolveInteraction(gameState, {
            type: action.interaction,
            teamId: answeringTeam.id,
            participantIds: participants.map(item => item.id),
            interactionId: actionInteractionId
          }, {
            correct: result.correct,
            firstTeamId: selectedTeamId,
            responses: action.interaction === 'SPEED_NETWORK_FIRST'
              ? getInteractionResponses(gameState, actionInteractionId)
              : undefined
          });
          if (!interactionResult.ok) {
            console.error('Não foi possível resolver a primeira gangue da disputa.', interactionResult.reason);
            feedbackMessage.textContent = 'GANGUE SELECIONADA INVÁLIDA // TENTE NOVAMENTE';
            return;
          }
          options.querySelectorAll('button').forEach(option => { option.disabled = true; });
          const selectedResponse = action.interaction === 'SPEED_NETWORK_FIRST'
            ? getInteractionResponses(gameState, actionInteractionId)
              .find(response => response.teamId === selectedTeamId)
            : null;
          const selectedCorrect = action.interaction === 'SPEED_NETWORK_FIRST'
            ? selectedResponse?.result === 'correct'
            : result.correct;
          feedbackMessage.textContent = interactionResult.blocked
            ? 'FIREWALL BLOQUEOU O DUELO'
            : action.interaction === 'SPEED_NETWORK_FIRST'
              ? selectedResponse?.result === 'correct'
                ? `${selectedTeam?.name ?? 'GANGUE'} ACERTOU // +1 CASA`
                : `${selectedTeam?.name ?? 'GANGUE'} ERROU // POSIÇÃO MANTIDA`
              : result.correct
                ? `${selectedTeam?.name ?? 'GANGUE'} ACERTOU // +3 CASAS`
                : `${selectedTeam?.name ?? 'GANGUE'} ERROU // POSIÇÃO MANTIDA`;
          const rewardMovement = interactionResult.movement ?? interactionResult.winner;
          const rewardTeam = selectedTeam;
          const finishDuel = () => {
            if (renderPenaltyChoices(interactionResult.penalties ?? [])) return;
            beginFinalizing(gameState);
            continueButton.disabled = false;
            continueButton.textContent = 'FINALIZAR TURNO';
            updateGameHud();
          };
          if (action.interaction === 'DUEL_FIRST' && interactionResult.blocked) {
            finishDuel();
            return;
          }
          if (selectedCorrect && rewardMovement?.ok && rewardTeam &&
              rewardTeam.houseId !== rewardStartHouse &&
              animateResolvedQuestionMovement(
                rewardTeam,
                rewardStartHouse,
                action.interaction === 'DUEL_FIRST'
                  ? 'DUELO'
                  : action.interaction === 'SPEED_NETWORK_FIRST'
                    ? 'REDE RELÂMPAGO'
                    : 'BATALHA RELÂMPAGO',
                feedbackMessage.textContent,
                finishDuel
              )) return;
          finishDuel();
        });
        options.append(button);
      });
      options.classList.add('has-gang-targets');
      feedback.hidden = false;
      updateGameHud();
      return;
    }
    if (action.questionResolution === 'BOSS_PROTOCOL_01' ||
        action.questionResolution === 'BOSS_PROTOCOL_02') {
      if (result.correct) {
        const rewardStartHouse = answeringTeam.houseId;
        const baseReward = Number(action.config?.reward ?? 2);
        const amount = baseReward + getQuestionMovementBonus(gameState, baseReward);
        const movement = amount > 0
          ? applyMovement({
              state: gameState,
              teamId: answeringTeam.id,
              delta: amount,
              reason: action.questionResolution,
              activateDestination: false,
              isReward: true
            })
          : { ok: true, houseId: answeringTeam.houseId };
        feedbackMessage.textContent = movement.canceledByInfiniteLoop
          ? 'RECOMPENSA CANCELADA // INFINITE LOOP CONSUMIDO'
          : amount > 0
            ? `PROTOCOLO RESOLVIDO // +${amount} CASA(S)`
            : 'PROTOCOLO RESOLVIDO // POSIÇÃO MANTIDA';
        let hackReward = null;
        if (action.questionResolution === 'BOSS_PROTOCOL_02') {
          const reward = grantRandomHack(gameState, answeringTeam.id);
          if (reward.added) {
            hackReward = reward.hack;
            feedbackMessage.textContent += ' // +1 HACK';
          } else {
            feedbackMessage.textContent += ' // LIMITE DE HACKS';
          }
        }
        const finalizeBossProtocol = () => {
          beginFinalizing(gameState);
          continueButton.disabled = false;
          continueButton.textContent = 'FINALIZAR TURNO';
          updateGameHud();
        };
        const finishBossProtocol = () => {
          finalizeBossProtocol();
          if (hackReward) {
            pendingQuestionConsequence = () => {
              showHackReward(hackReward);
              pendingQuestionConsequence = finalizeBossProtocol;
            };
            continueButton.textContent = 'PROSSEGUIR';
            return;
          }
        };
        if (answeringTeam.houseId !== rewardStartHouse &&
            animateResolvedQuestionMovement(
              answeringTeam,
              rewardStartHouse,
              'PROTOCOLO DO CHEFE',
              feedbackMessage.textContent,
              finishBossProtocol
            )) return;
        if (hackReward) {
          finishBossProtocol();
          return;
        }
      } else {
        feedbackMessage.textContent = `ERRO // PENALIDADE DE ${Math.abs(action.config?.penalty ?? 1)} CASA`;
        const penalties = [{
          teamId: answeringTeam.id,
          amount: Number(action.config?.penalty ?? -1),
          reason: action.questionResolution
        }];
        if (gameState.activeEvent === 'GLOBAL_VIRUS') {
          penalties.push({
            teamId: answeringTeam.id,
            amount: -3,
            reason: 'GLOBAL_VIRUS',
            event: true
          });
        }
        continueButton.disabled = true;
        if (renderPenaltyChoices(penalties)) return;
      }
      if (!hackReward) {
        beginFinalizing(gameState);
        continueButton.disabled = false;
        updateGameHud();
      }
      return;
    }
    if (action.questionResolution === 'BOSS_PROTOCOL_03') {
      if (result.correct) {
        const rewardStartHouse = answeringTeam.houseId;
        const movement = applyMovement({
          state: gameState,
          teamId: answeringTeam.id,
          delta: 1,
          reason: 'BOSS_PROTOCOL_03',
          activateDestination: false
        });
        if (movement.ok) {
          gameState.finalPortalUnlockedTeamIds ??= [];
          gameState.finalGatePendingTeamIds ??= [];
          if (!gameState.finalPortalUnlockedTeamIds.includes(answeringTeam.id)) {
            gameState.finalPortalUnlockedTeamIds.push(answeringTeam.id);
          }
          if (!gameState.finalGatePendingTeamIds.includes(answeringTeam.id)) {
            gameState.finalGatePendingTeamIds.push(answeringTeam.id);
          }
          feedbackMessage.textContent = 'PROTOCOLO RESOLVIDO // PORTAL FINAL DESBLOQUEADO';
          pushHistory(`${answeringTeam.name} desbloqueou o PORTAL FINAL`);
          if (movement.houseId !== rewardStartHouse &&
              animateResolvedQuestionMovement(
                answeringTeam,
                rewardStartHouse,
                'PROTOCOLO DO PORTAL',
                feedbackMessage.textContent,
                completeQuestionFlow
              )) return;
        }
      } else {
        feedbackMessage.textContent = 'PROTOCOLO NÃO RESOLVIDO // POSIÇÃO MANTIDA NA CASA 58';
      }
      beginFinalizing(gameState);
      continueButton.disabled = false;
      updateGameHud();
      return;
    }
    if (action.questionResolution === 'FINAL_GATE') {
      if (result.correct) {
        const rewardStartHouse = answeringTeam.houseId;
        const movement = applyMovement({
          state: gameState,
          teamId: answeringTeam.id,
          delta: 60 - answeringTeam.houseId,
          reason: 'FINAL_GATE',
          activateDestination: false
        });
        if (!movement.ok || movement.houseId !== 60) {
          console.error('O Portal Final não levou a equipe exatamente à Casa 60.', movement);
          feedbackMessage.textContent = 'PORTAL FINAL INDISPONÍVEL // POSIÇÃO MANTIDA';
          beginFinalizing(gameState);
          continueButton.disabled = false;
          updateGameHud();
          return;
        }
        const openFinalChallenge = () => {
          pushHistory(`${answeringTeam.name} atravessou o PORTAL FINAL`);
          gameState.action = null;
          gameState.phase = 'RESOLVING_HOUSE';
          openHouseAction(60);
        };
        if (movement.houseId !== rewardStartHouse &&
            animateResolvedQuestionMovement(
              answeringTeam,
              rewardStartHouse,
              'PORTAL FINAL',
              'PORTAL ABERTO // PROVA FINAL',
              openFinalChallenge
            )) return;
        openFinalChallenge();
        return;
      }
      const movement = applyMovement({
        state: gameState,
        teamId: answeringTeam.id,
        delta: 58 - answeringTeam.houseId,
        reason: 'FINAL_GATE_FAILURE',
        activateDestination: false
      });
      feedbackMessage.textContent = result.result === 'timeout'
        ? 'TEMPO ESGOTADO // RETORNO À CASA 58'
        : 'RESPOSTA ERRADA // RETORNO À CASA 58';
      if (movement.ok && movement.houseId !== answeringTeam.piece.houseId &&
          animateResolvedQuestionMovement(
            answeringTeam,
            answeringTeam.piece.houseId,
            'RETORNO AO PORTAL FINAL',
            feedbackMessage.textContent,
            completeQuestionFlow
          )) return;
      beginFinalizing(gameState);
      continueButton.disabled = false;
      updateGameHud();
      return;
    }
    if (action.questionResolution === 'FINAL_CHALLENGE') {
      const finalResult = resolveFinalChallenge(gameState, answeringTeam.id, result);
      if (!finalResult.ok) {
        feedbackMessage.textContent = 'PROVA FINAL ENCERRADA // RESPOSTA IGNORADA';
        continueButton.disabled = true;
        updateGameHud();
        return;
      }
      if (finalResult.correct && finalResult.advanced) {
        feedbackMessage.textContent = `ETAPA ${finalResult.attempt.stage} CONCLUÍDA // PREPARE-SE PARA A ETAPA ${finalResult.nextStage}`;
        pushHistory(`${answeringTeam.name} concluiu a etapa ${finalResult.attempt.stage}/3 do FINAL PROTOCOL`);
        pendingQuestionConsequence = () => {
          pendingQuestionConsequence = null;
          gameState.action = null;
          gameState.phase = 'RESOLVING_HOUSE';
          renderFinalProtocolNarrative(finalResult.nextStage);
        };
        continueButton.disabled = false;
        continueButton.textContent = 'PRÓXIMA ETAPA';
        updateGameHud();
        return;
      }
      if (finalResult.correct) {
        feedbackMessage.textContent = `FINALISTA DETECTED // ${answeringTeam.name}`;
        pushHistory(`${answeringTeam.name} concluiu a prova final // ${finalResult.rankingEntry.order}º lugar`);
        statusMessage.textContent = 'FINALISTA DETECTED // JANELA FINAL 60s';
        if (gameState.finished) {
          showVictoryScene(finalResult.rankingEntry, answeringTeam);
        } else {
          startFinalWindowTimer();
          showVictoryScene(finalResult.rankingEntry, answeringTeam);
        }
        continueButton.disabled = true;
        updateGameHud();
        return;
      } else {
        const movement = applyMovement({
          state: gameState,
          teamId: answeringTeam.id,
          delta: (action.config?.fallbackHouse ?? 58) - answeringTeam.houseId,
          reason: 'CENTRAL_NEXUS_FAILURE',
          activateDestination: false
        });
        feedbackMessage.textContent = result.result === 'timeout'
          ? 'TEMPO ESGOTADO // RETORNO À CASA 58'
          : 'PROVA NÃO CONCLUÍDA // RETORNO À CASA 58';
        if (movement.ok && movement.houseId !== answeringTeam.piece.houseId &&
            animateResolvedQuestionMovement(
              answeringTeam,
              answeringTeam.piece.houseId,
              'FALHA NO DESAFIO FINAL',
              feedbackMessage.textContent,
              completeQuestionFlow
            )) return;
      }
      beginFinalizing(gameState);
      continueButton.disabled = false;
      updateGameHud();
      return;
    }
    if (action.questionResolution === 'INFINITE_LOOP') {
      if (result.correct) {
        const rewardStartHouse = answeringTeam.houseId;
        const reward = Number(action.config?.reward ?? 3);
        const bonus = getQuestionMovementBonus(gameState, reward);
        const movement = applyMovement({
          state: gameState,
          teamId: answeringTeam.id,
          delta: reward + bonus,
          reason: 'INFINITE_LOOP_REWARD',
          activateDestination: false,
          isReward: true
        });
        if (movement.ok) {
          feedbackMessage.textContent = movement.canceledByInfiniteLoop
            ? 'RECOMPENSA CANCELADA // INFINITE LOOP CONSUMIDO'
            : `DEPURAÇÃO CORRETA // +${movement.houseId - rewardStartHouse} CASAS`;
          if (movement.houseId !== rewardStartHouse &&
              animateResolvedQuestionMovement(
                answeringTeam,
                rewardStartHouse,
                'RECOMPENSA INFINITE LOOP',
                feedbackMessage.textContent,
                completeQuestionFlow
              )) return;
        }
      } else {
        const applied = applyStatus(gameState, answeringTeam.id, 'INFINITE_LOOP', 1);
        feedbackMessage.textContent = applied
          ? 'ERRO DE DEPURAÇÃO // PRÓXIMA RECOMPENSA POSITIVA SERÁ CANCELADA'
          : 'ERRO DE DEPURAÇÃO // STATUS INDISPONÍVEL';
      }
      beginFinalizing(gameState);
      continueButton.disabled = false;
      updateGameHud();
      return;
    }
    if (action.questionResolution === 'HACK_REWARD') {
      if (result.correct) {
        const added = grantHack(gameState, answeringTeam.id, action.config?.hack ?? 'OVERRIDE');
        if (added) {
          feedbackMessage.textContent = `RESPOSTA CERTA // HACK ${action.config?.hack ?? 'OVERRIDE'} RECEBIDO`;
        } else {
          const rewardStartHouse = answeringTeam.houseId;
          const movement = applyMovement({
            state: gameState,
            teamId: answeringTeam.id,
            delta: Number(action.config?.fullFallback?.movement ?? 1),
            reason: 'HACK_REWARD_FALLBACK',
            activateDestination: false,
            isReward: true
          });
          if (movement.ok) {
            feedbackMessage.textContent = movement.canceledByInfiniteLoop
              ? 'LIMITE DE HACKS // AVANÇO CANCELADO PELO INFINITE LOOP'
              : `LIMITE DE HACKS // +${movement.houseId - rewardStartHouse} CASA(S)`;
            if (movement.houseId !== rewardStartHouse &&
                animateResolvedQuestionMovement(
                  answeringTeam,
                  rewardStartHouse,
                  'RECOMPENSA DE HACK',
                  feedbackMessage.textContent,
                  completeQuestionFlow
                )) return;
          }
        }
      } else {
        feedbackMessage.textContent = 'RESPOSTA ERRADA // NENHUM BÔNUS';
      }
      beginFinalizing(gameState);
      continueButton.disabled = false;
      updateGameHud();
      return;
    }
    if (action.questionResolution === 'CATCH_UP') {
      if (result.correct) {
        const ahead = getAdversaries(gameState, answeringTeam.id)
          .filter(candidate => candidate.houseId > answeringTeam.houseId)
          .sort((first, second) => first.houseId - second.houseId)[0];
        const amount = ahead
          ? Math.max(0, Math.min(3, ahead.houseId - answeringTeam.houseId - 1))
          : 3;
        const rewardStartHouse = answeringTeam.houseId;
        const movement = applyMovement({
          state: gameState,
          teamId: answeringTeam.id,
          delta: amount,
          reason: 'CATCH_UP',
          activateDestination: false,
          isReward: true
        });
        if (movement.ok) {
          feedbackMessage.textContent = movement.canceledByInfiniteLoop
            ? 'ALCANCE CANCELADO // INFINITE LOOP CONSUMIDO'
            : `ALCANCE CONCLUÍDO // +${movement.houseId - rewardStartHouse} CASA(S)`;
          if (movement.houseId !== rewardStartHouse &&
              animateResolvedQuestionMovement(
                answeringTeam,
                rewardStartHouse,
                'RECOMPENSA DE ALCANCE',
                feedbackMessage.textContent,
                completeQuestionFlow
              )) return;
        }
      } else {
        const rollbackStartHouse = answeringTeam.houseId;
        const rollback = returnTeamToTurnStart(gameState, answeringTeam.id);
        if (rollback.ok) {
          feedbackMessage.textContent = `ERRO // RETORNO À CASA ${rollback.houseId}`;
          if (rollback.houseId !== rollbackStartHouse &&
              animateResolvedQuestionMovement(
                answeringTeam,
                rollbackStartHouse,
                'RETORNO À ORIGEM DO TURNO',
                feedbackMessage.textContent,
                completeQuestionFlow
              )) return;
        } else {
          console.error('Falha ao retornar à posição de origem do turno.', rollback.reason);
        }
      }
      beginFinalizing(gameState);
      continueButton.disabled = false;
      updateGameHud();
      return;
    }
    if (action.interceptTargetId) {
      const interceptResult = resolveIntercept(
        gameState,
        answeringTeam.id,
        action.interceptTargetId,
        result.correct,
        actionInteractionId
      );
      const interceptedTeam = gameState.teams.find(item => item.id === action.interceptTargetId);
      feedbackMessage.textContent = interceptResult.stolen
        ? `INTERCEPTAR // ${interceptResult.hack} ROUBADO`
        : interceptResult.blocked
          ? 'FIREWALL BLOQUEOU O INTERCEPTAR'
          : result.correct ? 'ALVO RESISTIU // ROUBO FALHOU' : 'INTERCEPTAR // SEM HACK TRANSFERÍVEL';
      if (!interceptResult.blocked) {
        pushHistory(interceptResult.stolen
          ? `${answeringTeam.name} roubou ${interceptResult.hack} de ${interceptedTeam?.name ?? 'ALVO'}`
          : `${answeringTeam.name} não roubou HACK de ${interceptedTeam?.name ?? 'ALVO'}`);
      }
      const virusApplied = !result.correct && gameState.activeEvent === 'GLOBAL_VIRUS' &&
        renderPenaltyChoices([{
          teamId: action.interceptTargetId,
          amount: -3,
          reason: 'GLOBAL_VIRUS',
          event: true,
          interaction: true
        }]);
      if (!virusApplied) {
        beginFinalizing(gameState);
        continueButton.disabled = false;
        showHackActivation(
          'INTERCEPTAR',
          'INTERCEPTAR // RESULTADO',
          `${interceptedTeam?.name ?? 'ALVO'} // ${feedbackMessage.textContent}`
        );
      }
      updateGameHud();
      return;
    }
    if (action.interaction) {
      const respondentId = action.respondentId ?? answeringTeam.id;
      const registered = beginMultiplayerInteraction(gameState, actionInteractionId, [respondentId]);
      const response = registered.ok
        ? recordInteractionResponse(gameState, actionInteractionId, respondentId, result.result)
        : { accepted: false, reason: 'INTERACTION_EXISTS' };
      if (!response.accepted) {
        feedbackMessage.textContent = 'RESPOSTA JÁ REGISTRADA // INTERAÇÃO ENCERRADA';
        feedback.hidden = false;
        beginFinalizing(gameState);
        continueButton.disabled = false;
        updateGameHud();
        return;
      }
      const startingPositions = new Map(gameState.teams.map(item => [item.id, item.houseId]));
      const interactionResult = resolveInteraction(gameState, {
        type: action.interaction,
        teamId: answeringTeam.id,
        targetId: action.targetId,
        respondentId,
        participantIds: [respondentId],
        mode: action.mode,
        amount: action.amount,
        interactionId: actionInteractionId
      }, {
        responses: getInteractionResponses(gameState, actionInteractionId),
        correct: result.correct,
        correctAmount: action.correctAmount,
        wrongAmount: action.wrongAmount,
        deferPenalties: true
      });
      const presentInteractionResult = () => {
        const globalVirusPenalties = !result.correct && gameState.activeEvent === 'GLOBAL_VIRUS'
          ? [{
              teamId: respondentId,
              amount: -3,
              reason: 'GLOBAL_VIRUS',
              event: true,
              interaction: true
            }]
          : [];
        const allPenalties = [...(interactionResult.penalties ?? []), ...globalVirusPenalties];
        feedbackMessage.textContent = interactionResult.blocked
          ? 'FIREWALL BLOQUEOU A INTERAÇÃO'
          : action.interaction === 'HACK_HEIST'
            ? interactionResult.stolen
              ? 'HACK ROUBADO DO ALVO'
              : result.correct ? 'ROUBO FALHOU // NENHUM HACK FOI REMOVIDO' : 'ALVO SEM HACK TRANSFERÍVEL'
            : interactionResult.ok
              ? 'INTERAÇÃO RESOLVIDA // TURNO CONTINUA'
              : 'INTERAÇÃO INDISPONÍVEL // TURNO ENCERRADO';
        if (interactionResult.blocked) pushHistory(`${gameState.teams.find(item => item.id === action.targetId)?.name ?? 'ALVO'} protegido pelo FIREWALL`);
        else if (interactionResult.stolen) pushHistory(`${answeringTeam.name} roubou 1 HACK`);
        else if (action.interaction === 'KIDNAPPED' && interactionResult.status) {
          pushHistory(`${gameState.teams.find(item => item.id === action.targetId)?.name ?? 'ALVO'} recebeu FROZEN`);
        }
        if (!interactionResult.ok) console.error('Falha ao resolver interação.', interactionResult.reason);
        if (renderPenaltyChoices(allPenalties)) return;
        beginFinalizing(gameState);
        continueButton.disabled = false;
        updateGameHud();
      };
      if (!animateChangedTeamPositions(startingPositions, presentInteractionResult, gameState.phase)) {
        presentInteractionResult();
      }
      return;
    }
    if (action.questionResolution === 'NORMAL') {
      if (result.correct) {
        const reward = Number(action.config?.reward);
        if (Number.isFinite(reward) && reward > 0) {
          const rewardStartHouse = answeringTeam.houseId;
          const bonus = getQuestionMovementBonus(gameState, reward);
          const movement = applyMovement({
            state: gameState,
            teamId: answeringTeam.id,
            delta: reward + bonus,
            reason: 'QUESTION_REWARD',
            activateDestination: false,
            isReward: true
          });
          if (movement.ok) {
            if (movement.canceledByInfiniteLoop) {
              feedbackMessage.textContent = 'RECOMPENSA CANCELADA // INFINITE LOOP CONSUMIDO';
              pushHistory(`${answeringTeam.name} perdeu a próxima recompensa positiva // INFINITE LOOP`);
            } else {
              pushHistory(`${answeringTeam.name} avançou ${reward + bonus} casa(s)`);
              if (movement.houseId !== rewardStartHouse &&
                  animateResolvedQuestionMovement(
                    answeringTeam,
                    rewardStartHouse,
                    'RECOMPENSA DA PERGUNTA',
                    `RESPOSTA CERTA // +${movement.houseId - rewardStartHouse} CASA(S) // DESTINO NÃO ATIVADO`,
                    completeQuestionFlow
                  )) return;
            }
          }
        }
      } else if (gameState.activeEvent === 'GLOBAL_VIRUS') {
        const penalty = { amount: -3, houseId, event: true };
        feedbackMessage.textContent = 'VÍRUS GLOBAL // PENALIDADE DE 3 CASAS';
        continueButton.disabled = true;
        renderPenaltyChoices([{
          teamId: answeringTeam.id,
          amount: penalty.amount,
          reason: 'GLOBAL_VIRUS',
          event: true,
          houseId
        }]);
        updateGameHud();
        return;
      } else {
        const rollbackStartHouse = answeringTeam.houseId;
        const rollback = returnTeamToTurnStart(gameState, answeringTeam.id);
        if (rollback.ok) {
          pushHistory(`${answeringTeam.name} retornou à origem do turno // CASA ${rollback.houseId}`);
          feedbackMessage.textContent = `ERRO // RETORNO À CASA ${rollback.houseId}`;
          if (rollback.houseId !== rollbackStartHouse &&
              animateResolvedQuestionMovement(
                answeringTeam,
                rollbackStartHouse,
                'RETORNO À ORIGEM DO TURNO',
                `ERRO // RETORNO À CASA ${rollback.houseId}`,
                completeQuestionFlow
              )) return;
        } else {
          console.error('Falha ao retornar à posição de origem do turno.', rollback.reason);
          feedbackMessage.textContent = 'FALHA NO RETORNO À ORIGEM // TURNO ENCERRADO';
        }
      }
      beginFinalizing(gameState);
      continueButton.disabled = false;
      updateGameHud();
      return;
    }
    if (result.correct && action.config?.reward) {
      const reward = Number(action.config.reward);
      if (Number.isFinite(reward) && reward > 0) {
        const rewardStartHouse = answeringTeam.houseId;
        const bonus = getQuestionMovementBonus(gameState, reward);
        const movement = applyMovement({
          state: gameState,
          teamId: answeringTeam.id,
          delta: reward + bonus,
          reason: 'QUESTION_REWARD',
          activateDestination: false,
          isReward: true
        });
        if (movement.ok) {
          if (movement.canceledByInfiniteLoop) {
            feedbackMessage.textContent = 'RECOMPENSA CANCELADA // INFINITE LOOP CONSUMIDO';
          } else {
            pushHistory(`${answeringTeam.name} avançou ${movement.houseId - rewardStartHouse} casa(s)`);
            if (movement.houseId !== rewardStartHouse &&
                animateResolvedQuestionMovement(
                  answeringTeam,
                  rewardStartHouse,
                  'RECOMPENSA DA PERGUNTA',
                    `RESPOSTA CERTA // +${movement.houseId - rewardStartHouse} CASA(S) // DESTINO NÃO ATIVADO`,
                    completeQuestionFlow
                  )) return;
          }
        }
      }
    } else if (!result.correct) {
      const configuredPenalty = Number(action.config?.penalty);
      const penalty = {
        amount: Number.isFinite(configuredPenalty) && configuredPenalty < 0 ? configuredPenalty : 0,
        houseId,
        finalChallenge: action.type === 'FINISH',
        victory: Boolean(gameState.winner),
        essential: action.type === 'FINISH'
      };
      if (isPenaltyCancelable(penalty) &&
          renderPenaltyChoices([{
            teamId: answeringTeam.id,
            amount: penalty.amount,
            reason: 'QUESTION_PENALTY',
            houseId
          }])) return;
      const rollbackStartHouse = answeringTeam.houseId;
      const targetHouse = Number.isFinite(configuredPenalty) && configuredPenalty < 0
        ? moveTeam(gameState, answeringTeam.id, configuredPenalty)
        : getIncorrectAnswerHouse(houseId);
      moveToHouse(gameState, answeringTeam.id, targetHouse);
      pushHistory(`${answeringTeam.name} recuou para a casa ${targetHouse}`);
      if (targetHouse !== rollbackStartHouse &&
          animateResolvedQuestionMovement(
            answeringTeam,
            rollbackStartHouse,
            'PENALIDADE DA PERGUNTA',
            `ERRO // RETORNO À CASA ${targetHouse}`,
            completeQuestionFlow
          )) return;
    }
    if (houseId === 60 && result.correct) {
      gameState.winner = answeringTeam.id;
      gameState.finalists = [answeringTeam.id];
      feedbackMessage.textContent = 'CENTRAL NEXUS CONQUISTADO // VITÓRIA';
    }
    beginFinalizing(gameState);
    continueButton.disabled = false;
    updateGameHud();
  };
  options.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    if (gameState.paused || gameState.phase === 'FINALIZING' || questionResolved) return;
    if (collectResponses) {
      const response = recordInteractionResponse(gameState, actionInteractionId, button.dataset.mpTeam, button.dataset.mpResult);
      if (!response.accepted) return;
      button.parentElement.querySelectorAll('button').forEach(option => { option.disabled = true; });
      if (button.dataset.mpResult !== 'timeout') resetQuestionTimer?.();
      const responses = getInteractionResponses(gameState, actionInteractionId);
      if (responses.length < responseParticipants.length) {
        const latest = responses.at(-1);
        const latestTeam = gameState.teams.find(item => item.id === latest?.teamId);
        const latestResult = latest?.result === 'correct'
          ? 'ACERTO'
          : latest?.result === 'timeout'
            ? 'TEMPO ESGOTADO'
            : 'ERRO';
        feedback.textContent = `${latestTeam?.name ?? 'GANGUE'} // ${latestResult} // ${responses.length}/${responseParticipants.length}`;
        feedback.hidden = false;
        return;
      }
      if (action.interaction === 'SPEED_NETWORK_FIRST') {
        const latest = responses.at(-1);
        finishQuestion({
          correct: latest?.result === 'correct',
          result: latest?.result ?? 'wrong'
        });
        return;
      }
      questionResolved = true;
      stopQuestionTimer();
      resolveCollectedResponses();
      return;
    }
    if (hasChoice) {
      if (button.dataset.confirmTarget === 'true') {
        if (selectedTargetChoiceIndex === null) return;
        button.dataset.choice = String(selectedTargetChoiceIndex);
      } else if (isTargetChoice(action, Number(button.dataset.choice))) {
        selectedTargetChoiceIndex = Number(button.dataset.choice);
        options.querySelectorAll('.gang-target-option').forEach(option => {
          option.classList.toggle('is-selected', option === button);
        });
        const confirmButton = options.querySelector('[data-confirm-target="true"]');
        if (confirmButton) confirmButton.disabled = false;
        feedback.textContent = 'ALVO SELECIONADO // CONFIRME PARA PROSSEGUIR';
        feedback.hidden = false;
        return;
      }
      const choice = action.choices[Number(button.dataset.choice)];
      if (!choice) return;
      const selectedTargetId = action.type === 'INTERCEPT_TARGET'
        ? action.interceptTargets[Number(button.dataset.choice)]
        : choice.targetId;
      if (selectedTargetId && action.type !== 'INTERCEPT_TARGET' &&
          !getAdversaries(gameState, answeringTeam.id, {
            requireHack: action.interaction === 'HACK_HEIST'
          }).some(target => target.id === selectedTargetId)) {
        questionResolved = true;
        feedback.textContent = 'GANGUE ALVO INVÁLIDA // MECÂNICA CANCELADA';
        feedback.hidden = false;
        beginFinalizing(gameState);
        continueButton.disabled = false;
        updateGameHud();
        return;
      }
      questionResolved = true;
      if (action.type === 'DATA_TUNNEL_TARGET') {
        const target = gameState.teams.find(item => item.id === selectedTargetId);
        const result = swapWithTeamAhead(gameState, answeringTeam.id, selectedTargetId);
        if (result.ok && target) {
          gameState.teams.forEach(item => {
            if (!item.piece) return;
            item.piece.houseId = item.houseId;
            item.piece.targetHouseId = item.houseId;
          });
          const affectedHouses = new Set([result.fromHouseId, result.houseId]);
          gameState.teams.filter(item => affectedHouses.has(item.houseId)).forEach(item => {
            item.piece?.group.position.copy(getPawnTargetPosition(item.piece, item.houseId));
          });
          feedback.textContent = `POSIÇÕES TROCADAS // ${answeringTeam.name} NA CASA ${result.houseId}`;
          pushHistory(`${answeringTeam.name} trocou de posição com ${target.name}`);
        } else {
          feedback.textContent = 'ALVO NÃO ESTÁ À FRENTE // TROCA CANCELADA';
        }
        feedback.hidden = false;
        beginFinalizing(gameState);
        continueButton.disabled = false;
        updateGameHud();
        return;
      }
      if (action.type === 'VIRUS_INJECTION_TARGET') {
        const target = gameState.teams.find(item => item.id === selectedTargetId);
        if (!target || target.statuses?.VIRUS_INJECTION) {
          feedback.textContent = target
            ? `${target.name} JÁ ESTÁ SOB VIRUS INJECTION`
            : 'GANGUE ALVO INVÁLIDA // VÍRUS NÃO APLICADO';
          feedback.hidden = false;
          beginFinalizing(gameState);
          continueButton.disabled = false;
          updateGameHud();
          return;
        }
        const selection = selectQuestion({ state: gameState, difficulty: 'medium' });
        if (!selection.question) {
          feedback.textContent = 'NENHUMA PERGUNTA DISPONÍVEL // VÍRUS NÃO APLICADO';
          feedback.hidden = false;
          beginFinalizing(gameState);
          continueButton.disabled = false;
          updateGameHud();
          return;
        }
        registerQuestionUse(gameState, selection.question.id);
        const applied = applyStatus(gameState, target.id, 'VIRUS_INJECTION', 1);
        if (!applied) {
          feedback.textContent = 'NÃO FOI POSSÍVEL APLICAR VIRUS INJECTION';
          feedback.hidden = false;
          beginFinalizing(gameState);
          continueButton.disabled = false;
          updateGameHud();
          return;
        }
        target.statuses.VIRUS_INJECTION.escapeAttempted = true;
        pushHistory(`${target.name} recebeu VIRUS INJECTION`);
        popup.hidden = true;
        openHouseAction(houseId, {
          type: 'VIRUS_INJECTION_CHALLENGE',
          status: 'READY',
          respondentId: target.id,
          targetId: target.id,
          question: selection.question,
          timeLimit: null
        });
        return;
      }
      if (action.interaction === 'KIDNAPPED') {
        const interactionId = `${gameState.turn}:${houseId}:KIDNAPPED:${answeringTeam.id}:${selectedTargetId}`;
        const result = resolveInteraction(gameState, {
          type: 'KIDNAPPED',
          teamId: answeringTeam.id,
          targetId: selectedTargetId,
          interactionId
        }, {});
        const target = gameState.teams.find(item => item.id === selectedTargetId);
        feedback.textContent = result.blocked
          ? 'FIREWALL BLOQUEOU O SEQUESTRO'
          : result.status
            ? `FROZEN APLICADO A ${target?.name ?? 'GANGUE ALVO'}`
            : 'A GANGUE ALVO JÁ ESTÁ FROZEN.';
        feedback.hidden = false;
        pushHistory(result.blocked
          ? `${target?.name ?? 'Alvo'} protegido pelo FIREWALL`
          : `${target?.name ?? 'Alvo'} recebeu FROZEN`);
        beginFinalizing(gameState);
        continueButton.disabled = false;
        updateGameHud();
        return;
      }
      if (action.type === 'INTERCEPT_TARGET') {
        const targetId = action.interceptTargets[Number(button.dataset.choice)];
        const interactionId = `${gameState.turn}:${houseId}:INTERCEPTAR:${answeringTeam.id}:${targetId}`;
        const selection = isProtectedByFirewall(gameState, 'INTERCEPTAR', targetId)
          ? null
          : selectQuestion({ state: gameState, difficulty: 'medium' });
        if (!isProtectedByFirewall(gameState, 'INTERCEPTAR', targetId) && !selection?.question) {
          feedback.textContent = 'NENHUMA PERGUNTA DISPONÍVEL // HACK NÃO CONSUMIDO';
          feedback.hidden = false;
          beginFinalizing(gameState);
          continueButton.disabled = false;
          updateGameHud();
          return;
        }
        const started = beginIntercept(gameState, answeringTeam.id, targetId, interactionId);
        if (!started.ok) {
          feedback.textContent = 'ALVO INVÁLIDO // TURNO CONTINUA';
          feedback.hidden = false;
          beginFinalizing(gameState);
          continueButton.disabled = false;
          updateGameHud();
          return;
        }
        if (started.blocked) {
          feedback.textContent = 'FIREWALL BLOQUEOU O INTERCEPTAR';
          feedback.hidden = false;
          pushHistory(`${gameState.teams.find(item => item.id === targetId)?.name ?? 'Alvo'} protegido pelo FIREWALL`);
          beginFinalizing(gameState);
          continueButton.disabled = false;
          showHackActivation(
            'INTERCEPTAR',
            'INTERCEPTAR BLOQUEADO',
            `FIREWALL // ${gameState.teams.find(item => item.id === targetId)?.name ?? 'ALVO'} PROTEGIDO`
          );
          updateGameHud();
          return;
        }
        if (action.interaction) {
          const choiceEffect = choice.effect ?? {};
          if (!selection.question) {
            feedback.textContent = 'NENHUMA PERGUNTA DISPONÍVEL // TURNO CONTINUA';
            feedback.hidden = false;
            beginFinalizing(gameState);
            continueButton.disabled = false;
            updateGameHud();
            return;
          }
          registerQuestionUse(gameState, selection.question.id);
          popup.hidden = true;
          openHouseAction(houseId, {
            type: 'INTERACTION',
            status: 'READY',
            interaction: action.interaction,
            targetId,
            respondentId: targetId,
            interactionId,
            amount: choiceEffect.amount,
            question: selection?.question,
            timeLimit: choiceEffect.timeLimit ?? null
          });
          return;
        }
        registerQuestionUse(gameState, selection.question.id);
        popup.hidden = true;
        openHouseAction(houseId, {
          type: 'INTERCEPTAR',
          status: 'READY',
          question: selection.question,
          respondentId: targetId,
          timeLimit: null,
          interceptTargetId: targetId,
          interactionId
        });
        return;
      }
      if (action.interaction === 'DOUBLE_DICE') {
        if (choice?.effect?.type === 'secondary_dice') {
          openSecondDiceModal(houseId, answeringTeam);
          return;
        } else {
          feedback.textContent = 'SAFE MODE // POSIÇÃO MANTIDA';
        }
        feedback.hidden = false;
        beginFinalizing(gameState);
        continueButton.disabled = false;
        updateGameHud();
        return;
      }
      if (action.choiceQuestion) {
        const selection = selectQuestion({
          state: gameState,
          difficulty: choice?.effect?.difficulty ?? 'medium'
        });
        if (!selection.question) {
          feedback.textContent = 'NENHUMA PERGUNTA DISPONÍVEL // TURNO CONTINUA';
          feedback.hidden = false;
          beginFinalizing(gameState);
          continueButton.disabled = false;
          updateGameHud();
          return;
        }
        registerQuestionUse(gameState, selection.question.id);
        popup.hidden = true;
        openHouseAction(houseId, {
          type: 'QUESTION',
          status: 'READY',
          question: selection.question,
          questionResolution: 'NORMAL',
          config: { reward: choice.effect?.reward ?? 0 },
          timeLimit: null
        });
        return;
      }
      if (action.interaction && action.interaction !== 'BETRAYAL') {
        const choiceEffect = choice?.effect ?? {};
        const targetId = choice?.targetId ?? null;
        const interactionId = `${gameState.turn}:${houseId}:${action.interaction}:${answeringTeam.id}:${targetId ?? 'alone'}`;
        if (targetId && isProtectedByFirewall(gameState, action.interaction, targetId)) {
          const blocked = resolveInteraction(gameState, {
            type: action.interaction,
            teamId: answeringTeam.id,
            targetId,
            interactionId
          }, {});
          const target = gameState.teams.find(item => item.id === targetId);
          feedback.textContent = blocked.blocked
            ? 'FIREWALL BLOQUEOU A INTERAÇÃO'
            : 'INTERAÇÃO CANCELADA.';
          feedback.hidden = false;
          if (blocked.blocked) pushHistory(`${target?.name ?? 'Alvo'} protegido pelo FIREWALL`);
          beginFinalizing(gameState);
          continueButton.disabled = false;
          updateGameHud();
          return;
        }
        const selection = selectQuestion({
          state: gameState,
          difficulty: choiceEffect.difficulty ?? action.config?.difficulty ?? 'medium'
        });
        if (!selection.question) {
          feedback.textContent = 'NENHUMA PERGUNTA DISPONÍVEL // TURNO CONTINUA';
          feedback.hidden = false;
          beginFinalizing(gameState);
          continueButton.disabled = false;
          updateGameHud();
          return;
        }
        registerQuestionUse(gameState, selection.question.id);
        const mode = choiceEffect.mode ?? null;
        const dualResponse = Boolean(targetId &&
          (['DUEL', 'NETWORK_INVASION', 'ALLIANCE'].includes(action.interaction) ||
            (action.interaction === 'DOUBT' && mode === 'HELP')));
        const participantIds = dualResponse ? [answeringTeam.id, targetId] : [];
        popup.hidden = true;
        openHouseAction(houseId, {
          type: 'INTERACTION',
          status: 'READY',
          interaction: action.interaction,
          interactionId,
          targetId,
          respondentId: dualResponse ? null : targetId ?? answeringTeam.id,
          collectResponses: dualResponse,
          participantIds,
          requireResponses: dualResponse,
          mode,
          amount: choiceEffect.amount,
          correctAmount: choiceEffect.correct,
          wrongAmount: choiceEffect.wrong,
          question: selection.question,
          timeLimit: choiceEffect.timeLimit ?? null
        });
        return;
      }
      const startingPositions = new Map(gameState.teams.map(item => [item.id, item.houseId]));
      const choiceApplied = applyChoiceEffect(choice?.effect, answeringTeam);
      button.classList.add('is-correct');
      feedback.textContent = choiceApplied
        ? `ESCOLHA CONFIRMADA // ${choice?.name ?? 'SEM EFEITO'}`
        : choice?.effect?.type === 'hack'
          ? 'LIMITE DE 3 HACKS // NENHUM HACK ADICIONADO'
          : 'ESCOLHA CONFIRMADA // NENHUM EFEITO';
      feedback.hidden = false;
      const finishChoice = () => {
        beginFinalizing(gameState);
        continueButton.disabled = false;
        updateGameHud();
      };
      if (!animateChangedTeamPositions(startingPositions, finishChoice, gameState.phase)) {
        finishChoice();
      } else {
        continueButton.disabled = true;
      }
      if (choiceApplied && choice?.effect?.type === 'hack' &&
          String(choice.effect.hack).toUpperCase() === 'ESCUDO') {
        showHackReward('ESCUDO');
      }
      return;
    }
    const question = action.questions?.[action.currentQuestionIndex ?? 0] ?? action.question;
    finishQuestion(evaluateAnswer(question, button.dataset.answer), button);
  }));
  if (hasQuestion && Number.isFinite(action.timeLimit) && action.timeLimit > 0) {
    startQuestionTimer(action.timeLimit, () => {
      if (questionResolved || interactionToken !== questionInteractionToken) return;
      if (multiplayer) {
        options.querySelectorAll('.multiplayer-response').forEach(row => {
          const timeoutButton = row.querySelector('[data-mp-result="timeout"]');
          if (timeoutButton && !timeoutButton.disabled) timeoutButton.click();
        });
      } else {
        finishQuestion(evaluateAnswer(action.question, null, { timedOut: true }));
      }
    });
  }

  function applyChoiceEffect(effect, teamRecord) {
    if (!effect || typeof effect !== 'object') return false;
    if (effect.type === 'movement') {
      applyMovement({
        state: gameState,
        teamId: teamRecord.id,
        delta: Number.isFinite(effect.movement) ? effect.movement : 0,
        reason: 'CHOICE',
        activateDestination: false
      });
      return true;
    }
    if (effect.type === 'hack') return grantHack(gameState, teamRecord.id, effect.hack);
    if (effect.type === 'status') return applyStatus(gameState, teamRecord.id, effect.status, effect.turns ?? 1);
    if (effect.type === 'event') return Boolean(activateGlobalEventAction(gameState, effect.event));
    return effect.type === 'nothing';
  }
  popup.hidden = false;
  const animationId = ++actionTextAnimationId;
  popup.classList.add('is-opening');
  title.setAttribute('aria-label', titleText);
  prompt.setAttribute('aria-label', prompt.textContent);
  setTimeout(() => {
    decodeActionText(title, titleText, animationId);
    decodeActionText(prompt, prompt.textContent, animationId);
  }, 120);
  setTimeout(() => {
    if (animationId === actionTextAnimationId) popup.classList.remove('is-opening');
  }, 700);
  pushHistory(`${team(gameState).name} chegou à casa ${houseId}`);
  updateGameHud();
  const rewardHack = action.status === 'RESOLVED' && action.added
    ? action.hack ?? action.effect?.hack
    : null;
  if (String(rewardHack).toUpperCase() === 'ESCUDO') showHackReward('ESCUDO');
}

function startDiceRoll() {
  clearDoubleDiceVisual();
  const faceValue = rollDice(gameState);
  if (!faceValue) return;
  const current = team(gameState);
  beginDiceAnimation(
    gameState.diceValue,
    gameState.diceMovementValue,
    current.piece,
    current,
    'TURN',
    gameState.diceModifier
  );
  updateGameHud();
}

function beginDiceAnimation(faceValue, movementValue, piece, teamRecord, purpose, modifier = 0) {
  if (diceRoll) return false;
  diceCube.visible = true;
  const entryX = 2.4;
  diceCube.position.set(entryX, diceRestY + 0.28, 0);
  diceCube.quaternion.identity();
  diceRoll = {
    value: faceValue,
    movementValue,
    modifier,
    piece,
    teamRecord,
    purpose,
    startedAt: clock.elapsedTime,
    duration: DICE_ROLL_DURATION,
    entryX,
    targetQuaternion: createDiceTargetQuaternion(faceValue),
    settlingQuaternion: null
  };
  return true;
}

function createDiceTargetQuaternion(value) {
  const faces = [
    { value: 1, normal: new THREE.Vector3(1, 0, 0) },
    { value: 2, normal: new THREE.Vector3(-1, 0, 0) },
    { value: 3, normal: new THREE.Vector3(0, 1, 0) },
    { value: 4, normal: new THREE.Vector3(0, -1, 0) },
    { value: 5, normal: new THREE.Vector3(0, 0, 1) },
    { value: 6, normal: new THREE.Vector3(0, 0, -1) }
  ];
  const face = faces.find(item => item.value === value);
  return new THREE.Quaternion().setFromUnitVectors(face.normal, new THREE.Vector3(0, 0, 1));
}

function openSecondDiceModal(houseId, teamRecord) {
  clearDoubleDiceVisual();
  pendingDoubleDiceRoll = null;
  const popup = document.querySelector('#action-popup');
  const title = document.querySelector('#action-title');
  const prompt = document.querySelector('#action-prompt');
  const options = document.querySelector('#action-options');
  const feedback = document.querySelector('#action-feedback');
  const continueButton = document.querySelector('#close-action');
  const visual = createDoubleDiceVisual();
  document.querySelector('#action-type').textContent = 'SEGUNDO LANÇAMENTO';
  title.textContent = `CASA ${String(houseId).padStart(2, '0')} // DADO DUPLO`;
  prompt.classList.add('is-house-explanation');
  prompt.textContent = 'ARRISCAR // 1–2: recue 2 casas. 3–4: permaneça. 5–6: avance 3 casas. PROSSEGUIR aplica o resultado.';
  options.replaceChildren();
  feedback.replaceChildren();
  feedback.hidden = true;
  popup.querySelector('.action-card').insertBefore(visual, options);
  popup.classList.add('is-double-dice');
  activeDoubleDiceVisual = visual;
  const rollButton = document.createElement('button');
  rollButton.type = 'button';
  rollButton.textContent = 'ROLAR SEGUNDO DADO';
  rollButton.addEventListener('click', () => {
    if (diceRoll || gameState.paused) return;
    const secondRoll = 1 + Math.floor(Math.random() * 6);
    visual.setAttribute('aria-label', 'Dado rolando');
    visual.querySelector('.double-dice-cube').classList.add('is-rolling');
    rollButton.disabled = true;
    rollButton.textContent = 'DADO EM MOVIMENTO...';
    continueButton.disabled = true;
    continueButton.textContent = 'AGUARDE O RESULTADO';
    statusMessage.textContent = 'SEGUNDO LANÇAMENTO DO DADO';
    if (!beginDiceAnimation(secondRoll, secondRoll, teamRecord.piece, teamRecord, 'DOUBLE_DICE')) {
      console.error('Não foi possível iniciar a animação do segundo dado.');
      visual.setAttribute('aria-label', 'Dado clássico de seis faces');
      visual.querySelector('.double-dice-cube').classList.remove('is-rolling');
      rollButton.disabled = false;
      rollButton.textContent = 'ROLAR SEGUNDO DADO';
      continueButton.disabled = false;
      continueButton.textContent = 'CONTINUAR';
    }
  });
  options.append(rollButton);
  continueButton.disabled = true;
  continueButton.textContent = 'CONTINUAR';
  popup.classList.remove('is-correct', 'is-incorrect', 'is-opening');
  popup.hidden = false;
  updateGameHud();
}

function showMovementResultModal(type, titleText, message) {
  const popup = document.querySelector('#action-popup');
  const prompt = document.querySelector('#action-prompt');
  const feedback = document.querySelector('#action-feedback');
  const continueButton = document.querySelector('#close-action');
  if (!beginFinalizing(gameState)) {
    console.error('Não foi possível finalizar a resolução após o movimento.');
    return false;
  }
  document.querySelector('#action-type').textContent = type;
  document.querySelector('#action-title').textContent = titleText;
  prompt.classList.remove('is-house-explanation', 'is-event-result');
  prompt.textContent = message;
  prompt.setAttribute('aria-label', message);
  document.querySelector('#action-options').replaceChildren();
  feedback.replaceChildren();
  feedback.hidden = true;
  document.querySelector('#action-code').hidden = true;
  continueButton.disabled = false;
  continueButton.textContent = 'FINALIZAR TURNO';
  popup.classList.remove('is-correct', 'is-incorrect', 'is-opening');
  popup.hidden = false;
  updateGameHud();
  return true;
}

function animateResolvedQuestionMovement(teamRecord, startHouse, type, message, afterMovement = null) {
  const destination = teamRecord.houseId;
  if (destination === startHouse) return false;
  const popup = document.querySelector('#action-popup');
  const continueButton = document.querySelector('#close-action');
  popup.hidden = true;
  continueButton.disabled = true;
  const started = queuePawnMovement(teamRecord, startHouse, destination, {
    onComplete: () => {
      if (afterMovement) {
        afterMovement();
        updateGameHud();
        return;
      }
      returnToMap();
      showMovementResultModal(type, `CASA ${String(destination).padStart(2, '0')} // MOVIMENTO CONCLUÍDO`, message);
    }
  });
  if (!started) {
    console.error('Não foi possível iniciar a animação do movimento da resposta.');
    teamRecord.houseId = startHouse;
    teamRecord.piece.houseId = startHouse;
    teamRecord.piece.targetHouseId = startHouse;
    popup.hidden = false;
    continueButton.disabled = false;
    return false;
  }
  updateGameHud();
  return true;
}

function animateChangedTeamPositions(startPositions, onComplete, returnPhase = gameState.phase) {
  const changes = gameState.teams
    .map(teamRecord => ({
      teamRecord,
      startHouse: startPositions.get(teamRecord.id),
      destination: teamRecord.houseId
    }))
    .filter(change => Number.isInteger(change.startHouse) && change.startHouse !== change.destination);
  if (!changes.length) return false;

  changes.forEach(({ teamRecord, startHouse }) => {
    teamRecord.houseId = startHouse;
    if (teamRecord.piece) {
      teamRecord.piece.houseId = startHouse;
      teamRecord.piece.targetHouseId = startHouse;
    }
  });

  const animateNext = () => {
    const change = changes.shift();
    if (!change) {
      onComplete?.();
      updateGameHud();
      return;
    }
    if (!queuePawnMovement(change.teamRecord, change.startHouse, change.destination, {
      returnPhase,
      onComplete: animateNext
    })) {
      console.error(`Não foi possível animar o movimento de ${change.teamRecord.name}.`);
      change.teamRecord.houseId = change.startHouse;
      if (change.teamRecord.piece) {
        change.teamRecord.piece.houseId = change.startHouse;
        change.teamRecord.piece.targetHouseId = change.startHouse;
      }
      onComplete?.();
      updateGameHud();
    }
  };
  animateNext();
  return true;
}

function queuePawnMovement(teamRecord, startHouse, lastHouse, {
  primary = false,
  returnPhase = primary ? 'RESOLVING_HOUSE' : gameState.phase,
  onComplete = null
} = {}) {
  const piece = teamRecord?.piece;
  if (!piece || diceMove ||
      !beginMovement(gameState, teamRecord.id, startHouse, returnPhase)) return false;
  const direction = Math.sign(lastHouse - startHouse);
  const remaining = Math.abs(lastHouse - startHouse);
  piece.houseId = startHouse;
  piece.targetHouseId = remaining ? startHouse + direction : lastHouse;
  diceMove = {
    piece,
    teamRecord,
    startHouse,
    remaining,
    nextHouse: startHouse,
    lastHouse,
    direction,
    primary,
    onComplete,
    phase: remaining ? 'moving' : 'arrival',
    resumeAt: clock.elapsedTime + 0.65,
    stepStartedAt: clock.elapsedTime,
    stepFrom: piece.group.position.clone(),
    stepTo: remaining
      ? getPawnTargetPosition(piece, piece.targetHouseId)
      : piece.group.position.clone()
  };
  return true;
}

function updateConeJump(piece, progress) {
  const keyframes = [
    [0, 0.78],
    [0.16, 0.72],
    [0.4, 1.22],
    [0.7, 1.1],
    [0.88, 0.8],
    [1, 1]
  ];
  let scaleY = 1;
  for (let index = 1; index < keyframes.length; index += 1) {
    const [endProgress, endScale] = keyframes[index];
    const [startProgress, startScale] = keyframes[index - 1];
    if (progress > endProgress) continue;
    const amount = THREE.MathUtils.smoothstep(progress, startProgress, endProgress);
    scaleY = THREE.MathUtils.lerp(startScale, endScale, amount);
    break;
  }

  piece.cone.scale.set(1 / Math.sqrt(scaleY), scaleY, 1 / Math.sqrt(scaleY));
  piece.cone.position.y = piece.coneBaseY + (1.45 / 2) * scaleY;
  if (piece.head) piece.head.position.y = piece.headBaseY + 1.45 * (scaleY - 1);
}

function updateDiceAnimation(elapsed) {
  if (!diceRoll) return;
  const elapsedTime = elapsed - diceRoll.startedAt;
  const progress = THREE.MathUtils.clamp(elapsedTime / diceRoll.duration, 0, 1);
  const entryProgress = THREE.MathUtils.clamp(elapsedTime / 0.52, 0, 1);
  const fallProgress = THREE.MathUtils.clamp((elapsedTime - 0.48) / 0.24, 0, 1);
  diceCube.position.x = THREE.MathUtils.lerp(diceRoll.entryX, 0, 1 - (1 - entryProgress) ** 3);
  diceCube.position.y = THREE.MathUtils.lerp(diceRestY + 0.28, diceRestY, fallProgress * fallProgress);
  if (elapsedTime > 0.72) {
    const bounceTime = elapsedTime - 0.72;
    diceCube.position.y += Math.abs(Math.sin(bounceTime * 15)) * 0.28 * Math.exp(-4.5 * bounceTime);
  }
  const spinProgress = THREE.MathUtils.clamp(progress / 0.78, 0, 1);
  const easedSpin = 1 - (1 - spinProgress) ** 3;
  if (progress < 0.78) {
    diceCube.rotation.set(
      easedSpin * Math.PI * 2 * (4 + diceRoll.value % 3),
      easedSpin * Math.PI * 2 * (5 + (diceRoll.value + 1) % 3),
      easedSpin * Math.PI * 2 * (3 + (diceRoll.value + 2) % 3)
    );
  } else {
    diceRoll.settlingQuaternion ??= diceCube.quaternion.clone();
    const settleProgress = THREE.MathUtils.clamp((progress - 0.78) / 0.22, 0, 1);
    diceCube.quaternion.copy(diceRoll.settlingQuaternion).slerp(diceRoll.targetQuaternion, settleProgress * settleProgress * (3 - 2 * settleProgress));
  }
  if (progress < 1) return;

  const { value, movementValue, modifier, piece, teamRecord, purpose } = diceRoll;
  diceCube.quaternion.copy(diceRoll.targetQuaternion);
  diceCube.position.set(0, diceRestY, 0);
  diceRoll = null;
  if (purpose === 'DOUBLE_DICE') {
    diceCube.visible = false;
    if (activeDoubleDiceVisual) {
      activeDoubleDiceVisual.querySelector('.double-dice-cube').classList.remove('is-rolling');
      activeDoubleDiceVisual.querySelector('.double-dice-cube').dataset.value = String(value);
      activeDoubleDiceVisual.setAttribute('aria-label', `Dado mostrando ${value} pontos`);
    }
    const startHouse = piece.targetHouseId ?? teamRecord.houseId;
    const delta = value <= 2 ? -2 : value <= 4 ? 0 : 3;
    const destination = Math.max(1, Math.min(60, startHouse + delta));
    const movementText = delta > 0 ? `+${delta} CASAS` : delta < 0 ? `${delta} CASAS` : 'SEM ALTERAÇÃO';
    const resultMessage = `SEGUNDO DADO: ${value} // ${movementText} // CASA ${destination}`;
    pendingDoubleDiceRoll = { teamRecord, startHouse, value };
    statusMessage.textContent = `SEGUNDO DADO // ${value}`;
    document.querySelector('#action-prompt').textContent = resultMessage;
    document.querySelector('#close-action').disabled = false;
    document.querySelector('#close-action').textContent = 'APLICAR RESULTADO';
    updateGameHud();
    return;
  }
  settleDice(gameState);
  gameState.phase = 'DICE_RESULT';
  const modifierText = modifier > 0
    ? ` // BÔNUS TURBO DE REDE +${modifier} // MOVIMENTO ${movementValue}`
    : '';
  statusMessage.textContent = `RESULTADO DO DADO // ${value}${modifierText}`;
  pushHistory(`${teamRecord.name} tirou ${value}${modifierText}`);
  updateGameHud();
  setTimeout(() => {
    diceCube.visible = false;
    const pawnPosition = piece.group.getWorldPosition(new THREE.Vector3());
    pawnPosition.y += 1.1;
    focusHouse(teamRecord.houseId, pawnPosition);
    gameState.phase = 'FOCUSING_PAWN';
    updateGameHud();
    setTimeout(() => {
      const startHouse = teamRecord.houseId;
      const lastHouse = Math.min(60, startHouse + movementValue);
      if (!queuePawnMovement(teamRecord, startHouse, lastHouse, { primary: true })) {
        console.error('Não foi possível iniciar o movimento principal do peão.');
        return;
      }
      updateGameHud();
    }, 900);
  }, 450);
}

function setupGameControls() {
  document.querySelector('#roll-dice').addEventListener('click', startDiceRoll);
  document.querySelector('#global-event-proceed').addEventListener('click', () => {
    dismissGlobalEventIndicator();
  });
  document.querySelector('#action-popup').addEventListener('wheel', event => event.stopPropagation());
  document.querySelector('#close-action').addEventListener('click', () => {
    if (pendingRandomResolution) {
      if (gameState.paused || gameState.phase !== 'RESOLVING_HOUSE') return;
      const pending = pendingRandomResolution;
      const startingPositions = new Map(gameState.teams.map(item => [item.id, item.houseId]));
      clearRandomRoulette();
      document.querySelector('#action-popup').hidden = true;
      const resolvedAction = resolveDeferredRandomOutcome({
        state: gameState,
        team: team(gameState),
        houseId: pending.houseId,
        outcome: pending.outcome
      });
      const continueResolution = () => renderResolvedHouseAction(pending.houseId, resolvedAction);
      if (!animateChangedTeamPositions(startingPositions, continueResolution, gameState.phase)) {
        continueResolution();
      }
      return;
    }
    if (pendingDoubleDiceRoll) {
      if (gameState.paused || diceRoll || gameState.phase !== 'RESOLVING_HOUSE') return;
      const pending = pendingDoubleDiceRoll;
      pendingDoubleDiceRoll = null;
      const result = resolveDoubleDice(gameState, pending.teamRecord.id, pending.value);
      if (!result.ok) {
        console.error('Falha ao resolver o segundo dado.', result.reason);
        returnToMap();
        showMovementResultModal(
          'DADO DUPLO',
          `CASA ${String(pending.startHouse).padStart(2, '0')} // MOVIMENTO NÃO APLICADO`,
          'SEGUNDO DADO INVÁLIDO // POSIÇÃO MANTIDA'
        );
        return;
      }
      const movementText = result.delta > 0
        ? `+${result.delta} CASAS`
        : result.delta < 0 ? `${result.delta} CASAS` : 'SEM ALTERAÇÃO';
      const resultMessage = `SEGUNDO DADO: ${result.roll} // ${movementText} // CASA ${result.houseId}`;
      pushHistory(`${pending.teamRecord.name} rolou o segundo dado: ${result.roll} // ${movementText}`);
      updateGameHud();
      if (result.houseId !== pending.startHouse &&
          !animateResolvedQuestionMovement(pending.teamRecord, pending.startHouse, 'DADO DUPLO', resultMessage)) {
        returnToMap();
        showMovementResultModal(
          'DADO DUPLO',
          `CASA ${String(pending.startHouse).padStart(2, '0')} // MOVIMENTO NÃO APLICADO`,
          'NÃO FOI POSSÍVEL INICIAR O MOVIMENTO // POSIÇÃO MANTIDA'
        );
      } else if (result.houseId === pending.startHouse) {
        returnToMap();
        showMovementResultModal(
          'DADO DUPLO',
          `CASA ${String(result.houseId).padStart(2, '0')} // RESULTADO`,
          resultMessage
        );
      }
      return;
    }
    if (pendingQuestionConsequence) {
      if (gameState.paused) return;
      const continueQuestion = pendingQuestionConsequence;
      pendingQuestionConsequence = null;
      continueQuestion();
      return;
    }
    if (pendingHouseExplanationId !== null) {
      if (gameState.paused || !['RESOLVING_HOUSE', 'FINAL_CHALLENGE'].includes(gameState.phase)) return;
      const houseId = pendingHouseExplanationId;
      const finalProtocolNarrativeStage = pendingFinalProtocolNarrativeStage;
      pendingHouseExplanationId = null;
      pendingFinalProtocolNarrativeStage = null;
      if (finalProtocolNarrativeStage !== null) {
        document.querySelector('#action-popup').hidden = true;
        renderResolvedHouseAction(houseId);
        return;
      }
      if (getHouse(houseId)?.type === 'CHECKPOINT') {
        document.querySelector('#action-popup').hidden = true;
        resolveHouse(gameState, houseId);
        if (!beginFinalizing(gameState)) {
          console.error('Não foi possível finalizar o checkpoint após a explicação.');
          return;
        }
        const advanced = finishTurn(gameState);
        if (advanced && gameState.phase === 'RESOLVING_HOUSE') {
          openHouseAction(team(gameState).houseId);
        }
        returnToMap();
        updateGameHud();
        return;
      }
      document.querySelector('#action-popup').hidden = true;
      renderResolvedHouseAction(houseId);
      return;
    }
    if (gameState.phase === 'FINISHED') {
      document.querySelector('#action-popup').hidden = true;
      return;
    }
    if (gameState.paused || gameState.phase !== 'FINALIZING') return;
    stopQuestionTimer();
    questionInteractionToken += 1;
    document.querySelector('#action-popup').hidden = true;
    const advanced = finishTurn(gameState);
    if (advanced && gameState.phase === 'RESOLVING_HOUSE') {
      openHouseAction(team(gameState).houseId);
    }
    returnToMap();
    updateGameHud();
  });
  document.querySelector('#pause-game').addEventListener('click', event => {
    gameState.paused = true;
    updateGameHud();
  });
  document.querySelector('#continue-game').addEventListener('click', () => {
    gameState.paused = false;
    updateGameHud();
  });
  document.querySelector('#next-turn').addEventListener('click', () => {
    if (gameState.paused || gameState.phase !== 'FINALIZING' ||
        gameState.moving || diceMove || diceRoll) return;
    const advanced = finishTurn(gameState);
    if (advanced && gameState.phase === 'RESOLVING_HOUSE') {
      openHouseAction(team(gameState).houseId);
    }
    updateGameHud();
  });
  document.querySelector('#previous-turn').addEventListener('click', () => {
    if (!confirm('Voltar para o turno anterior?')) return;
    gameState.currentTeamIndex = (gameState.currentTeamIndex - 1 + gameState.teams.length) % gameState.teams.length;
    gameState.phase = 'PREPARING';
    gameState.rolling = false;
    gameState.action = null;
    updateGameHud();
  });
  updateGameHud();
}

const savedGameKey = 'code-race-neon-city-game';
let editingTeamId = null;

function showAdminFeedback(message, error = false) {
  const feedback = document.querySelector('#admin-feedback');
  feedback.textContent = message;
  feedback.style.color = error ? '#edbd7c' : '';
}

function openProfessorCenter() {
  const overlay = document.querySelector('#professor-overlay');
  overlay.hidden = false;
  renderProfessorCenter();
  document.querySelector('#close-professor-center').focus();
}

function closeProfessorCenter() {
  document.querySelector('#professor-overlay').hidden = true;
  document.querySelector('#open-professor-center').focus();
}

function openTeamEditor(teamRecord = null) {
  if (!teamRecord && gameState.teams.length >= 8) {
    showAdminFeedback('Limite de 8 equipes atingido.', true);
    return;
  }
  editingTeamId = teamRecord?.id ?? null;
  document.querySelector('#team-editor-title').textContent = teamRecord ? 'Editar gangue' : 'Nova gangue';
  document.querySelector('#team-name').value = teamRecord?.name ?? '';
  document.querySelector('#team-members').value = teamRecord?.members.join(', ') ?? '';
  document.querySelector('#team-color').value = `#${Number(teamRecord?.color ?? 0x4ee6e4).toString(16).padStart(6, '0')}`;
  document.querySelector('#team-avatar').value = teamRecord?.character ?? 'bubbleguy';
  document.querySelector('#team-editor').hidden = false;
  document.querySelector('#team-name').focus();
}

function setTeamAvatar(teamRecord, character) {
  if (!portraitFiles[character]) return;
  teamRecord.character = character;
  replaceTeamAvatar(teamRecord);
}

function saveTeamEditor(event) {
  event.preventDefault();
  const name = document.querySelector('#team-name').value.trim();
  const members = document.querySelector('#team-members').value.split(',').map(item => item.trim()).filter(Boolean);
  const character = document.querySelector('#team-avatar').value;
  const color = Number.parseInt(document.querySelector('#team-color').value.slice(1), 16);
  const duplicate = gameState.teams.some(item => item.id !== editingTeamId && item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (!name || !members.length || duplicate || !portraitFiles[character]) {
    showAdminFeedback(duplicate ? 'Já existe uma equipe com esse nome.' : 'Informe nome, ao menos um integrante e avatar válido.', true);
    return;
  }
  if (editingTeamId) {
    const teamRecord = gameState.teams.find(item => item.id === editingTeamId);
    if (!teamRecord) return;
    teamRecord.name = name;
    teamRecord.members = members;
    teamRecord.color = color;
    if (teamRecord.character !== character) setTeamAvatar(teamRecord, character);
  } else {
    if (gameState.teams.length >= 8) {
      showAdminFeedback('Limite de 8 equipes atingido.', true);
      return;
    }
    const id = globalThis.crypto?.randomUUID?.() ?? `team-${Date.now()}`;
    gameState.teams.push({ id, name, members, color, character, houseId: 1, hacks: 0, ownedHacks: [] });
    addTeamToActiveEvent(gameState, id);
  }
  synchronizeTeamPieces();
  document.querySelector('#team-editor').hidden = true;
  editingTeamId = null;
  showAdminFeedback('Equipe atualizada.');
  updateGameHud();
}

function deleteTeam(teamId) {
  if (gameState.phase !== 'PREPARING' || gameState.moving || diceMove || diceRoll) {
    showAdminFeedback('Conclua o turno atual antes de excluir uma equipe.', true);
    return;
  }
  if (gameState.teams.length <= 2) {
    showAdminFeedback('A partida precisa manter pelo menos 2 equipes.', true);
    return;
  }
  const index = gameState.teams.findIndex(item => item.id === teamId);
  if (index < 0) return;
  const teamRecord = gameState.teams[index];
  if (teamRecord.finalist || gameState.finalRanking.some(item => item.teamId === teamId)) {
    showAdminFeedback('Uma equipe finalista não pode ser excluída da classificação.', true);
    return;
  }
  if (!confirm(`Excluir ${teamRecord.name}? Esta ação altera a partida atual.`)) return;
  removeTeamFromActiveEvent(gameState, teamId);
  gameState.teams.splice(index, 1);
  if (index < gameState.currentTeamIndex) gameState.currentTeamIndex -= 1;
  else if (index === gameState.currentTeamIndex) gameState.currentTeamIndex %= gameState.teams.length;
  synchronizeTeamPieces();
  showAdminFeedback('Equipe excluída.');
  updateGameHud();
}

function applyPositionCorrection(event) {
  event.preventDefault();
  const teamRecord = gameState.teams.find(item => item.id === document.querySelector('#correction-team').value);
  const position = Number(document.querySelector('#correction-position').value);
  if (!teamRecord || !Number.isInteger(position) || position < 1 || position > 60) return;
  const cancelsActiveMovement = diceMove?.teamRecord === teamRecord || diceRoll?.teamRecord === teamRecord;
  const confirmation = `Mover ${teamRecord.name} para a casa ${position}?${cancelsActiveMovement ? ' A ação em andamento será cancelada.' : ''}`;
  if (!confirm(confirmation)) return;
  if (diceMove?.teamRecord === teamRecord || diceRoll?.teamRecord === teamRecord) {
    diceMove = null;
    diceRoll = null;
    diceCube.visible = false;
    gameState.rolling = false;
    gameState.phase = 'PREPARING';
  }
  teamRecord.houseId = position;
  synchronizeTeamPieces();
  showAdminFeedback(`Posição de ${teamRecord.name} corrigida para a casa ${position}.`);
  updateGameHud();
}

// TEMPORÁRIO: remover junto com a seção MODO TESTE antes da versão final.
function activateTestHouse(event) {
  event.preventDefault();
  const teamId = document.querySelector('#test-house-team').value;
  const houseId = Number(document.querySelector('#test-house-position').value);
  const teamIndex = gameState.teams.findIndex(item => item.id === teamId);
  const teamRecord = gameState.teams[teamIndex];
  const actionPopup = document.querySelector('#action-popup');
  if (!teamRecord || teamIndex < 0 || !Number.isInteger(houseId) || houseId < 1 || houseId > 60) {
    showAdminFeedback('Selecione uma gangue e uma casa válida entre 1 e 60.', true);
    return;
  }
  if (gameState.moving || diceMove || diceRoll || !actionPopup.hidden) {
    showAdminFeedback('Finalize a ação atual antes de iniciar um teste de casa.', true);
    return;
  }
  if (gameState.finished || teamRecord.finalist) {
    showAdminFeedback('A gangue selecionada não pode testar uma casa neste estado.', true);
    return;
  }
  stopQuestionTimer();
  clearRandomRoulette();
  clearDoubleDiceVisual();
  pendingDoubleDiceRoll = null;
  pendingHouseExplanationId = null;
  pendingFinalProtocolNarrativeStage = null;
  pendingQuestionConsequence = null;
  questionInteractionToken += 1;
  gameState.currentTeamIndex = teamIndex;
  gameState.turnStartHouseId = houseId;
  gameState.action = null;
  gameState.rolling = false;
  gameState.diceValue = null;
  gameState.diceFaceValue = null;
  gameState.diceMovementValue = null;
  gameState.phase = 'PREPARING';
  if (moveToHouse(gameState, teamRecord.id, houseId) !== houseId) {
    showAdminFeedback('Não foi possível posicionar a gangue para o teste.', true);
    return;
  }
  synchronizeTeamPieces();
  closeProfessorCenter();
  openHouseAction(houseId);
  updateGameHud();
}

function applyHackCorrection(event) {
  event.preventDefault();
  const teamRecord = gameState.teams.find(item => item.id === document.querySelector('#correction-team').value);
  const hacks = Number(document.querySelector('#correction-hacks').value);
  if (!teamRecord || !Number.isInteger(hacks) || hacks < 0 || hacks > 3) return;
  if (!confirm(`Definir HACKs de ${teamRecord.name} para ${hacks}?`)) return;
  if (!setHackCount(gameState, teamRecord.id, hacks)) return;
  showAdminFeedback(`HACKs de ${teamRecord.name} corrigidos.`);
  updateGameHud();
}

function createSavedGameSnapshot() {
  return {
    version: 1,
    questionDifficulty: gameState.questionDifficulty,
    currentTeamIndex: gameState.currentTeamIndex,
    turn: gameState.turn,
    round: gameState.round,
    turnStartHouseId: gameState.turnStartHouseId,
    activeEvent: gameState.activeEvent,
    eventRoundsRemaining: gameState.eventRoundsRemaining,
    eventRemainingTeamIds: gameState.eventRemainingTeamIds ?? [],
    networkTurboRemainingTeamIds: gameState.networkTurboRemainingTeamIds ?? [],
    eventActivationTeamId: gameState.eventActivationTeamId,
    eventActivationTurn: gameState.eventActivationTurn,
    eventActivationTurnInProgress: gameState.eventActivationTurnInProgress,
    paused: gameState.paused,
    history: gameState.history,
    usedQuestionIds: gameState.usedQuestionIds,
    winner: gameState.winner,
    finalists: gameState.finalists,
    finalRanking: gameState.finalRanking,
    finalPortalUnlockedTeamIds: gameState.finalPortalUnlockedTeamIds,
    finalGatePendingTeamIds: gameState.finalGatePendingTeamIds,
    finalChallengeAttempts: gameState.finalChallengeAttempts,
    finalChallenge: gameState.finalChallenge,
    finalProtocol: gameState.finalProtocol,
    finalChallengeAction: gameState.phase === 'FINAL_CHALLENGE' ? gameState.action : null,
    finalWindow: gameState.finalWindow,
    finished: gameState.finished,
    teams: gameState.teams.map(({ id, name, members, color, character, houseId, hacks, ownedHacks, statuses = {}, finalist = false }) => ({
      id, name, members, color, character, houseId, hacks, ownedHacks: Array.isArray(ownedHacks)
        ? ownedHacks
        : Array.from({ length: Math.max(0, Math.min(3, Number(hacks) || 0)) }, () => 'TURBO'), statuses, finalist
    }))
  };
}

function validateSavedGame(value) {
  if (!value || !Array.isArray(value.teams) || value.teams.length < 2 || value.teams.length > 8) throw new Error('O arquivo salvo não contém entre 2 e 8 equipes.');
  const ids = new Set();
  const names = new Set();
  const teams = value.teams.map(item => {
    const name = String(item.name ?? '').trim();
    const id = String(item.id ?? '');
    const members = Array.isArray(item.members) ? item.members.map(String).map(member => member.trim()).filter(Boolean) : [];
    const color = Number(item.color);
    const houseId = Number(item.houseId);
    const hacks = Number(item.hacks);
    if (!id || !name || !members.length || !portraitFiles[item.character] || !Number.isInteger(color) || color < 0 || color > 0xffffff || !Number.isInteger(houseId) || houseId < 1 || houseId > 60 || !Number.isInteger(hacks) || hacks < 0 || hacks > 3) {
      throw new Error('Há dados inválidos em uma equipe salva.');
    }
    if (ids.has(id) || names.has(name.toLocaleLowerCase())) throw new Error('Os identificadores e nomes das equipes devem ser únicos.');
    ids.add(id);
    names.add(name.toLocaleLowerCase());
    return {
      id,
      name,
      members,
      color,
      character: item.character,
      houseId,
      hacks,
      ownedHacks: Array.isArray(ownedHacks)
        ? ownedHacks
        : Array.from({ length: Math.max(0, Math.min(3, Number(hacks) || 0)) }, () => 'TURBO'),
      statuses: { ...(item.statuses ?? {}) },
      finalist: Boolean(item.finalist)
    };
  });
  const currentTeamIndex = Number(value.currentTeamIndex);
  if (!Number.isInteger(currentTeamIndex) || currentTeamIndex < 0 || currentTeamIndex >= teams.length) throw new Error('Índice do turno inválido nos dados salvos.');
  const questionDifficulty = value.questionDifficulty === undefined
    ? 'normal'
    : normalizeQuestionDifficulty(value.questionDifficulty);
  if (value.questionDifficulty !== undefined && value.questionDifficulty !== questionDifficulty) {
    throw new Error('A dificuldade salva é inválida.');
  }
  const savedTurnStartHouseId = Number(value.turnStartHouseId);
  let activeEvent = professorEvents.some(item => item.id === value.activeEvent) ? value.activeEvent : null;
  const validTeamIds = new Set(teams.map(item => item.id));
  const savedEventTeams = Array.isArray(value.eventRemainingTeamIds)
    ? [...new Set(value.eventRemainingTeamIds.map(String).filter(id => validTeamIds.has(id)))]
    : teams.map(item => item.id);
  const eventRemainingTeamIds = activeEvent ? savedEventTeams : [];
  if (activeEvent && !eventRemainingTeamIds.length) activeEvent = null;
  const networkTurboRemainingTeamIds = activeEvent === 'NETWORK_TURBO'
    ? (Array.isArray(value.networkTurboRemainingTeamIds)
        ? [...new Set(value.networkTurboRemainingTeamIds.map(String).filter(id =>
            validTeamIds.has(id) && eventRemainingTeamIds.includes(id)
          ))]
        : [...eventRemainingTeamIds])
    : [];
  const savedFinalists = Array.isArray(value.finalists)
    ? [...new Set(value.finalists.map(String).filter(id => validTeamIds.has(id)))]
    : teams.filter(item => item.finalist).map(item => item.id);
  teams.forEach(item => { item.finalist = savedFinalists.includes(item.id); });
  const finalRanking = Array.isArray(value.finalRanking)
    ? value.finalRanking
        .filter(item => item && validTeamIds.has(String(item.teamId)) && item.result === 'correct')
        .map((item, index) => ({
          teamId: String(item.teamId),
          order: index + 1,
          result: 'correct',
          completedAt: Number.isFinite(item.completedAt) ? item.completedAt : Date.now()
        }))
    : savedFinalists.map((teamId, index) => ({
        teamId,
        order: index + 1,
        result: 'correct',
        completedAt: Date.now()
      }));
  const rankedTeamIds = new Set(finalRanking.map(item => item.teamId));
  teams.forEach(item => { item.finalist = rankedTeamIds.has(item.id); });
  const finalPortalUnlockedTeamIds = Array.isArray(value.finalPortalUnlockedTeamIds)
    ? [...new Set(value.finalPortalUnlockedTeamIds.map(String).filter(id => validTeamIds.has(id)))]
    : [];
  const finalGatePendingTeamIds = Array.isArray(value.finalGatePendingTeamIds)
    ? [...new Set(value.finalGatePendingTeamIds.map(String).filter(id =>
        validTeamIds.has(id) && finalPortalUnlockedTeamIds.includes(id) &&
        teams.find(item => item.id === id)?.houseId === 59
      ))]
    : [];
  const finalChallengeAttempts = Array.isArray(value.finalChallengeAttempts)
    ? value.finalChallengeAttempts
        .filter(item => item && validTeamIds.has(String(item.teamId)) &&
          getQuestionBank().some(question => question.id === item.questionId) &&
          ['ACTIVE', 'PASSED', 'FAILED'].includes(item.status))
        .map((item, index) => ({
          attemptId: Number.isInteger(item.attemptId) && item.attemptId > 0 ? item.attemptId : index + 1,
          teamId: String(item.teamId),
          questionId: item.questionId,
          status: item.status,
          result: ['correct', 'wrong', 'timeout'].includes(item.result) ? item.result : undefined,
          startedAt: Number.isFinite(item.startedAt) ? item.startedAt : Date.now(),
          completedAt: Number.isFinite(item.completedAt) ? item.completedAt : undefined,
          remainingMs: Math.max(0, Math.min(60000, Number(item.remainingMs) || 0))
        }))
    : [];
  const savedFinalProtocol = value.finalProtocol;
  const finalProtocol = savedFinalProtocol &&
    validTeamIds.has(String(savedFinalProtocol.teamId)) &&
    Number.isInteger(savedFinalProtocol.stage) &&
    savedFinalProtocol.stage >= 1 &&
    savedFinalProtocol.stage <= 3 &&
    ['ACTIVE', 'FAILED', 'PASSED'].includes(savedFinalProtocol.status)
    ? {
        status: savedFinalProtocol.status,
        stage: savedFinalProtocol.stage,
        totalStages: 3,
        teamId: String(savedFinalProtocol.teamId)
      }
    : null;
  const lastAttempt = finalChallengeAttempts.at(-1) ?? null;
  let finalChallenge = lastAttempt?.status === 'ACTIVE' ? lastAttempt : null;
  const savedFinalChallengeAction = value.finalChallengeAction;
  const finalChallengeAction = finalChallenge && savedFinalChallengeAction?.questionId === finalChallenge.questionId
    ? {
        type: 'FINISH',
        status: 'READY',
        question: getQuestionBank().find(question => question.id === finalChallenge.questionId),
        questionId: finalChallenge.questionId,
        timeLimit: 60,
        challenge: 'CENTRAL NEXUS',
        questionResolution: 'FINAL_CHALLENGE',
        finalAttemptId: finalChallenge.attemptId,
        finalProtocolStage: finalChallenge.stage ?? finalProtocol?.stage ?? 1,
        finalProtocolTotal: 3,
        finalProtocolLabel: ['ENTRADA PRINCIPAL', 'SISTEMA DE SEGURANÇA', 'CENTRAL NEXUS'][(finalChallenge.stage ?? 1) - 1] ?? 'CENTRAL NEXUS',
        finalProtocolChallenge: [
          'Você invadiu a entrada principal da base do NEXUS. Agora precisa hackear o sistema do portão para conseguir entrar.',
          'Você entrou na base. Agora precisa invadir o sistema de segurança para conseguir atravessar a instalação e chegar ao núcleo do NEXUS.',
          'Você chegou ao CENTRAL NEXUS. A IA está no núcleo do sistema. Desative o NEXUS.'
        ][(finalChallenge.stage ?? 1) - 1] ?? 'Você chegou ao CENTRAL NEXUS. A IA está no núcleo do sistema. Desative o NEXUS.'
      }
    : null;
  if (finalChallenge && !finalChallengeAction) {
    finalChallenge.status = 'FAILED';
    finalChallenge.result = 'timeout';
    finalChallenge.completedAt = Date.now();
    finalChallenge.remainingMs = 0;
    const abandonedTeam = teams.find(item => item.id === finalChallenge.teamId);
    if (abandonedTeam && !abandonedTeam.finalist) abandonedTeam.houseId = 58;
    finalChallenge = null;
  }
  const savedWindow = value.finalWindow;
  const finalWindow = {
    active: Boolean(savedWindow?.active && finalRanking.length && !value.finished),
    durationMs: 60000,
    remainingMs: Math.max(0, Math.min(60000, Number(savedWindow?.remainingMs) || 0)),
    startedAt: Number.isFinite(savedWindow?.startedAt) ? savedWindow.startedAt : null
  };
  const winner = validTeamIds.has(String(value.winner)) &&
    finalRanking.some(item => item.teamId === String(value.winner))
    ? String(value.winner)
    : finalRanking[0]?.teamId ?? null;
  let restoredTeamIndex = currentTeamIndex;
  let restoredTurn = Number.isInteger(value.turn) && value.turn > 0 ? value.turn : 1;
  let restoredFinished = Boolean(value.finished);
  if (!restoredFinished && !finalChallengeAction && teams[restoredTeamIndex].finalist) {
    const nextIndex = Array.from({ length: teams.length }, (_, offset) =>
      (restoredTeamIndex + offset + 1) % teams.length
    ).find(index => !teams[index].finalist);
    if (nextIndex === undefined) {
      restoredFinished = true;
      finalWindow.active = false;
    } else {
      restoredTeamIndex = nextIndex;
      restoredTurn += 1;
    }
  }
  return {
    teams,
    questionDifficulty,
    currentTeamIndex: restoredTeamIndex,
    turnStartHouseId: restoredTeamIndex === currentTeamIndex &&
      Number.isInteger(savedTurnStartHouseId) && savedTurnStartHouseId >= 1 && savedTurnStartHouseId <= 60
      ? savedTurnStartHouseId
      : teams[restoredTeamIndex].houseId,
    turn: restoredTurn,
    round: Number.isInteger(value.round) && value.round > 0 ? value.round : 1,
    activeEvent,
    eventRoundsRemaining: eventRemainingTeamIds.length,
    eventRemainingTeamIds,
    networkTurboRemainingTeamIds,
    eventActivationTeamId: validTeamIds.has(String(value.eventActivationTeamId))
      ? String(value.eventActivationTeamId)
      : null,
    eventActivationTurn: Number.isInteger(value.eventActivationTurn) && value.eventActivationTurn > 0
      ? value.eventActivationTurn
      : null,
    eventActivationTurnInProgress: false,
    paused: Boolean(value.paused),
    history: Array.isArray(value.history) ? value.history.map(String).slice(0, 4) : [],
    usedQuestionIds: Array.isArray(value.usedQuestionIds) ? value.usedQuestionIds.map(String) : [],
    winner,
    finalists: finalRanking.map(item => item.teamId),
    finalRanking,
    finalPortalUnlockedTeamIds,
    finalGatePendingTeamIds,
    finalChallengeAttempts,
    finalChallenge,
    finalProtocol,
    finalWindow,
    finished: restoredFinished,
    phase: restoredFinished ? 'FINISHED' : finalChallengeAction ? 'FINAL_CHALLENGE' : 'PREPARING',
    action: finalChallengeAction
  };
}

async function loadSavedGameSnapshot(value) {
  stopQuestionTimer();
  clearRandomRoulette();
  pendingDoubleDiceRoll = null;
  questionInteractionToken += 1;
  pendingHouseExplanationId = null;
  pendingFinalProtocolNarrativeStage = null;
  document.querySelector('#action-popup').hidden = true;
  const snapshot = validateSavedGame(value);
  const selectedQuestionBank = await loadQuestionBank(snapshot.questionDifficulty);
  setQuestionBank(selectedQuestionBank, snapshot.questionDifficulty);
  Object.assign(gameState, snapshot, { rolling: false, moving: false });
  if (gameState.finished) {
    gameState.phase = 'FINISHED';
  } else if (gameState.phase === 'FINAL_CHALLENGE' && gameState.action) {
    gameState.phase = 'FINAL_CHALLENGE';
  } else if (team(gameState)?.statuses?.FROZEN) {
    gameState.phase = 'FROZEN_ESCAPE';
    gameState.frozenEscape = { teamId: team(gameState).id, attempts: 0, maxAttempts: 1, status: 'READY' };
  } else if (team(gameState)?.statuses?.VIRUS_INJECTION &&
      !team(gameState).statuses.VIRUS_INJECTION.escapeAttempted) {
    gameState.phase = 'VIRUS_INJECTION_ESCAPE';
  }
  diceMove = null;
  synchronizeTeamPieces();
  updateGameHud();
  if (gameState.phase === 'FINAL_CHALLENGE' && gameState.action) {
    openHouseAction(team(gameState).houseId, gameState.action);
  } else if (gameState.phase === 'PREPARING' && activatePendingFinalGate(gameState)) {
    openHouseAction(59);
    updateGameHud();
  }
  if (gameState.finalWindow.active) startFinalWindowTimer();
  if (gameState.finished) showFinalStandings();
}

function restartGame() {
  stopQuestionTimer();
  stopFinalWindowTimer();
  clearRandomRoulette();
  pendingDoubleDiceRoll = null;
  questionInteractionToken += 1;
  pendingHouseExplanationId = null;
  pendingFinalProtocolNarrativeStage = null;
  document.querySelector('#action-popup').hidden = true;
  const freshState = createGameState(configuredInitialTeams, initialQuestionDifficulty);
  Object.assign(gameState, freshState);
  diceRoll = null;
  diceMove = null;
  synchronizeTeamPieces();
  updateGameHud();
}

function setupProfessorControls() {
  const avatarSelect = document.querySelector('#team-avatar');
  Object.keys(portraitFiles).forEach(character => {
    const option = document.createElement('option');
    option.value = character;
    option.textContent = character.toUpperCase();
    avatarSelect.appendChild(option);
  });
  document.querySelector('#open-professor-center').addEventListener('click', openProfessorCenter);
  document.querySelector('#close-professor-center').addEventListener('click', closeProfessorCenter);
  document.querySelector('#close-professor-footer').addEventListener('click', closeProfessorCenter);
  const professorOverlay = document.querySelector('#professor-overlay');
  professorOverlay.addEventListener('click', event => {
    if (event.target === event.currentTarget) closeProfessorCenter();
  });
  professorOverlay.addEventListener('wheel', event => event.stopPropagation());
  addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.querySelector('#professor-overlay').hidden) closeProfessorCenter();
  });
  document.querySelector('#add-team').addEventListener('click', () => openTeamEditor());
  document.querySelector('#cancel-team-edit').addEventListener('click', () => {
    document.querySelector('#team-editor').hidden = true;
    editingTeamId = null;
  });
  document.querySelector('#team-editor').addEventListener('submit', saveTeamEditor);
  document.querySelector('#admin-team-list').addEventListener('click', event => {
    const editButton = event.target.closest('[data-team-edit]');
    const deleteButton = event.target.closest('[data-team-delete]');
    if (editButton) openTeamEditor(gameState.teams.find(item => item.id === editButton.dataset.teamEdit));
    if (deleteButton) deleteTeam(deleteButton.dataset.teamDelete);
  });
  document.querySelector('#admin-event-list').addEventListener('click', event => {
    const help = event.target.closest('.help-button');
    if (help) {
      help.classList.toggle('is-open');
      return;
    }
    const button = event.target.closest('[data-event]');
    if (!button) return;
    activateEvent(gameState, button.dataset.event);
    updateGameHud();
  });
  document.querySelectorAll('.professor-modal > .professor-content .help-button').forEach(button => {
    button.addEventListener('click', () => button.classList.toggle('is-open'));
  });
  document.querySelector('#position-correction').addEventListener('submit', applyPositionCorrection);
  document.querySelector('#test-house-activation').addEventListener('submit', activateTestHouse);
  document.querySelector('#hack-correction').addEventListener('submit', applyHackCorrection);
  document.querySelector('#save-game').addEventListener('click', () => {
    try {
      localStorage.setItem(savedGameKey, JSON.stringify(createSavedGameSnapshot()));
      showAdminFeedback('Partida salva neste navegador.');
    } catch (error) {
      showAdminFeedback(`Falha ao salvar: ${error.message}`, true);
    }
  });
  document.querySelector('#load-game').addEventListener('click', async () => {
    try {
      const saved = localStorage.getItem(savedGameKey);
      if (!saved) {
        showAdminFeedback('Nenhuma partida salva foi encontrada.', true);
        return;
      }
      await loadSavedGameSnapshot(JSON.parse(saved));
      showAdminFeedback('Partida carregada.');
    } catch (error) {
      showAdminFeedback(`Falha ao carregar: ${error.message}`, true);
    }
  });
  document.querySelector('#restart-game').addEventListener('click', () => {
    if (!confirm('Iniciar nova partida? O estado atual será substituído.')) return;
    restartGame();
    showAdminFeedback('Nova partida iniciada.');
  });
  document.querySelector('#clear-game').addEventListener('click', () => {
    if (!confirm('Apagar os dados da partida salvos neste navegador?')) return;
    localStorage.removeItem(savedGameKey);
    showAdminFeedback('Dados salvos removidos. A partida atual não foi alterada.');
  });
  renderProfessorCenter();
}

function focusHouse(houseId, pawnPosition = null) {
  if (!houses[houseId - 1]) return;
  if (cameraState.mode === 'MAP') {
    savedMapOrbit.azimuth = mapOrbit.targetAzimuth;
    savedMapOrbit.polar = mapOrbit.targetPolar;
    savedMapOrbit.distance = mapOrbit.targetDistance;
  }
  cameraState.mode = 'FOCUS_HOUSE';
  cameraState.houseId = houseId;
  cameraState.progress = 0;
  getBestFocusCameraPosition(houseId);
  if (pawnPosition) {
    focusFollowDelta.subVectors(cameraState.focusPosition, cameraState.focusTarget);
    cameraState.focusTarget.copy(pawnPosition);
    cameraState.focusPosition.copy(pawnPosition).addScaledVector(focusFollowDelta, 0.72);
  }
  targetFov = 31;
  visibilityDirty = true;
  isDragging = false;
  statusMessage.textContent = `FOCO NA CASA ${String(houseId).padStart(2, '0')} // ${houses[houseId - 1].sector}`;
}

function returnToMap() {
  cameraState.mode = 'RETURNING_TO_MAP';
  cameraState.progress = 0;
  targetFov = 42;
  cameraState.focusOccluders.clear();
  visibilityDirty = true;
  restoreBuildingOpacity();
  mapOrbit.targetAzimuth = savedMapOrbit.azimuth;
  mapOrbit.targetPolar = savedMapOrbit.polar;
  mapOrbit.targetDistance = savedMapOrbit.distance;
  statusMessage.textContent = 'VISÃO DO MAPA // CIDADE ATIVA';
}

function addAtmosphere() {
  addWetGround();
  addStreetLights();
  addLivingCity();
  addRainLayer(420, 0.1, 0.28, 120, 260, 0.34);
  addRainLayer(280, 0.2, 0.36, 78, 190, 0.58);
  addRainLayer(120, 0.38, 0.48, 44, 120, 0.92);
}

function positionDiceStage() {
  const distance = 12;
  const halfHeight = distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const halfWidth = halfHeight * camera.aspect;
  diceStage.position.set(halfWidth - 1.8, -halfHeight + 1.35, -distance);
}

function updateDiceBaseVisibility() {
  const visible = cameraState.mode === 'MAP' &&
    (gameState.phase === 'PREPARING' || gameState.phase === 'ROLLING');
  dicePlatform.visible = visible;
  diceEdge.visible = visible;
}

function syncDiceForegroundCamera() {
  camera.getWorldPosition(diceForegroundCameraPosition);
  camera.getWorldQuaternion(diceForegroundCameraQuaternion);
  diceForegroundCamera.position.copy(diceForegroundCameraPosition);
  diceForegroundCamera.quaternion.copy(diceForegroundCameraQuaternion);
  diceForegroundCamera.fov = camera.fov;
  diceForegroundCamera.aspect = camera.aspect;
  diceForegroundCamera.near = camera.near;
  diceForegroundCamera.far = camera.far;
  diceForegroundCamera.updateProjectionMatrix();
  diceForegroundCamera.updateMatrixWorld(true);
}

// Reflexos sutis permanecem no piso sem criar manchas geométricas escuras.
function addWetGround() {
  const reflectionColors = [0x4ee6e4, 0xff4fd8, 0xe6a85e, 0xb36cff];
  for (let i = 0; i < 18; i += 1) {
    const reflectionMaterial = new THREE.MeshBasicMaterial({
      color: reflectionColors[i % reflectionColors.length], transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false
    });
    const reflection = new THREE.Mesh(new THREE.PlaneGeometry(1.2 + Math.random() * 3.2, 0.05), reflectionMaterial);
    reflection.position.set((Math.random() - 0.5) * 100, 0.055, (Math.random() - 0.5) * 100);
    reflection.rotation.x = -Math.PI / 2;
    reflection.rotation.z = Math.random() * Math.PI;
    city.add(reflection);
  }
}

function addStreetLights() {
  const poleMaterial = new THREE.MeshBasicMaterial({ color: 0x435a64 });
  const lampColors = [0x4ee6e4, 0xe6a85e, 0xff4f73];
  for (let i = 0; i < 14; i += 1) {
    const x = -54 + (i % 7) * 18 + (Math.random() - 0.5) * 4;
    const z = -48 + Math.floor(i / 7) * 48 + (Math.random() - 0.5) * 7;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 4.2, 5), poleMaterial);
    pole.position.set(x, 2.1, z);
    city.add(pole);
    const color = lampColors[i % lampColors.length];
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), new THREE.MeshBasicMaterial({ color }));
    lamp.position.set(x, 4.25, z);
    city.add(lamp);
    const light = new THREE.PointLight(color, 1.5, 9, 2.3);
    light.position.copy(lamp.position);
    scene.add(light);
    cityLights.push({ light, lamp, phase: Math.random() * 6, base: 1.5 });
  }
}

function addLivingCity() {
  const vehicleMaterials = [materials.cyan, materials.amber, materials.red];
  const vehiclePaths = [
    new THREE.CatmullRomCurve3([new THREE.Vector3(-58, 0.42, -45), new THREE.Vector3(-20, 0.42, -45), new THREE.Vector3(22, 0.42, -30), new THREE.Vector3(55, 0.42, -8)]),
    new THREE.CatmullRomCurve3([new THREE.Vector3(48, 0.44, 50), new THREE.Vector3(22, 0.44, 36), new THREE.Vector3(-10, 0.44, 30), new THREE.Vector3(-52, 0.44, 14)])
  ];
  const vehicleModels = assetLibrary.available('vehicles', CITY_ASSETS.vehicles);
  for (let i = 0; i < 7; i += 1) {
    let vehicle;
    if (vehicleModels.length) vehicle = assetLibrary.instantiate(vehicleModels[i % vehicleModels.length]);
    else {
      vehicle = new THREE.Mesh(sharedGeometry.vehicle, vehicleMaterials[i % vehicleMaterials.length]);
      vehicle.scale.set(0.72 + Math.random() * 0.55, 0.7, 0.72);
    }
    scene.add(vehicle);
    animatedVehicles.push({ mesh: vehicle, curve: vehiclePaths[i % vehiclePaths.length], offset: Math.random(), speed: 0.012 + Math.random() * 0.022 });
  }
}

function addRainLayer(count, size, opacity, height, spread, speed) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const velocities = [];
  for (let i = 0; i < count; i += 1) {
    positions.push((Math.random() - 0.5) * spread, Math.random() * height, (Math.random() - 0.5) * spread);
    velocities.push(speed * (0.7 + Math.random() * 0.7));
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const rain = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xa8e1e5,
    size,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false
  }));
  rain.frustumCulled = false;
  scene.add(rain);
  rainLayers.push({ rain, velocities, spread, height, drift: Math.random() * 1000 });
}

addRoads();
addBuildings();
addRoadNetwork();
addUrbanBoard();
addAtmosphere();
setupGameControls();
setupProfessorControls();

addEventListener('pointermove', event => {
  mouse.x = (event.clientX / innerWidth) * 2 - 1;
  mouse.y = (event.clientY / innerHeight) * 2 - 1;
  if (isDragging && cameraState.mode === 'MAP') {
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    mapOrbit.targetAzimuth -= dx * 0.0055;
    mapOrbit.targetPolar = THREE.MathUtils.clamp(mapOrbit.targetPolar - dy * 0.0045, mapOrbit.minPolar, mapOrbit.maxPolar);
  }
});
addEventListener('pointerdown', event => {
  if (event.button !== 0 || cameraState.mode !== 'MAP') return;
  isDragging = true;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
});
addEventListener('pointerup', () => { isDragging = false; });
addEventListener('pointerleave', () => { isDragging = false; });
addEventListener('wheel', event => {
  if (cameraState.mode !== 'MAP') return;
  event.preventDefault();
  mapOrbit.targetDistance = THREE.MathUtils.clamp(mapOrbit.targetDistance + event.deltaY * 0.05, mapOrbit.minDistance, mapOrbit.maxDistance);
}, { passive: false });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  positionDiceStage();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloomPass.setSize(innerWidth / 2, innerHeight / 2);
});

function updateCamera(elapsed) {
  if (victorySceneState?.cameraTarget) {
    camera.position.lerp(victorySceneState.cameraTarget, 0.075);
    camera.lookAt(victorySceneState.cameraLookAt);
    camera.fov += (victorySceneState.targetCameraFov - camera.fov) * 0.08;
    camera.updateProjectionMatrix();
    return;
  }
  if (cameraState.mode === 'FOCUS_HOUSE') {
    targetCamera.copy(cameraState.focusPosition);
    targetLookAt.copy(cameraState.focusTarget);
    camera.position.lerp(targetCamera, 0.075);
    camera.lookAt(targetLookAt);
  } else {
    mapOrbit.azimuth += (mapOrbit.targetAzimuth - mapOrbit.azimuth) * 0.09;
    mapOrbit.polar += (mapOrbit.targetPolar - mapOrbit.polar) * 0.09;
    mapOrbit.distance += (mapOrbit.targetDistance - mapOrbit.distance) * 0.09;
    const drift = isDragging ? 0 : 1;
    const azimuth = mapOrbit.azimuth + Math.sin(elapsed * 0.045) * 0.02 * drift;
    const sinPolar = Math.sin(mapOrbit.polar);
    targetCamera.set(
      mapOrbit.target.x + Math.cos(azimuth) * sinPolar * mapOrbit.distance,
      mapOrbit.target.y + Math.cos(mapOrbit.polar) * mapOrbit.distance,
      mapOrbit.target.z + Math.sin(azimuth) * sinPolar * mapOrbit.distance
    );
    targetLookAt.copy(mapOrbit.target);
    if (cameraState.mode === 'RETURNING_TO_MAP') {
      camera.position.lerp(targetCamera, 0.055);
      if (camera.position.distanceTo(targetCamera) < 0.22) cameraState.mode = 'MAP';
    } else camera.position.copy(targetCamera);
    camera.lookAt(targetLookAt);
  }
  camera.fov += (targetFov - camera.fov) * (cameraState.mode === 'FOCUS_HOUSE' ? 0.08 : 0.05);
  camera.updateProjectionMatrix();
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.04);
  const elapsed = clock.elapsedTime;
  if (!diceCube.visible) city.rotation.y = Math.sin(elapsed * 0.045) * 0.035;
  updateCamera(elapsed);
  syncDiceForegroundCamera();
  positionDiceStage();
  updateDiceAnimation(elapsed);
  updateDiceBaseVisibility();
  updateBuildingLod();
  updateHouseVisibility(visibilityDirty);
  animateOccluderOpacity();
  cyanLight.intensity = 15 + Math.sin(elapsed * 1.4) * 1.5;
  amberLight.intensity = 10 + Math.sin(elapsed * 0.7 + 1) * 1.2;
  windows.forEach(windowLight => {
    windowLight.mesh.material.opacity = animatedBuildingOpacity(windowLight.mesh, windowLight.base * (0.72 + Math.sin(elapsed * 0.65 + windowLight.phase) * 0.2));
  });
  facadeLights.forEach(sign => {
    const speed = sign.speed ?? 1.2;
    const glitch = sign.glitch && Math.sin(elapsed * (sign.flickerHeavy ? 11 : 7) + sign.phase) < (sign.flickerHeavy ? -0.6 : -0.78);
    const blackout = sign.blackoutChance && Math.sin(elapsed * 0.37 + sign.phase * 3.1) > (1 - sign.blackoutChance * 40);
    let opacity;
    if (glitch || blackout) opacity = 0.06;
    else opacity = sign.base * (0.72 + Math.sin(elapsed * speed + sign.phase) * 0.18);
    sign.mesh.material.opacity = animatedBuildingOpacity(sign.mesh, opacity);
  });
  cityLights.forEach(streetLight => {
    streetLight.light.intensity = streetLight.base * (0.76 + Math.sin(elapsed * 1.15 + streetLight.phase) * 0.14);
    streetLight.lamp.material.opacity = 0.74 + Math.sin(elapsed * 1.15 + streetLight.phase) * 0.16;
  });
  dataStreams.forEach(stream => {
    stream.offset = (stream.offset + delta * stream.speed) % 1;
    const point = stream.curve.getPointAt(stream.offset);
    stream.marker.position.copy(point);
    stream.marker.material.opacity = stream.glitch && Math.sin(elapsed * 5 + stream.offset * 20) < -0.72 ? 0.08 : 0.9;
  });
  const occupantsByHouse = updateHousePortraits(elapsed);
  pieces.forEach(piece => {
    const moving = diceMove?.piece === piece;
    if (victorySceneState?.piece === piece) {
      const victoryTime = elapsed - victorySceneState.phaseStartedAt;
      piece.cone.scale.set(1, 1, 1);
      piece.cone.position.y = piece.coneBaseY + 1.45 / 2;
      if (piece.head) piece.head.position.y = piece.headBaseY;
      piece.group.position.x = 0;
      piece.group.position.z = 0;
      if (victorySceneState.phase === 'celebrating') {
        piece.group.position.y = Math.max(0, Math.sin(victoryTime * 4.4)) * 0.52;
        piece.group.rotation.set(
          victorySceneState.baseRotation.x,
          victorySceneState.baseRotation.y + victoryTime * 3.2,
          victorySceneState.baseRotation.z
        );
      } else if (victorySceneState.phase === 'falling') {
        const fallProgress = THREE.MathUtils.clamp((victoryTime - 0.2) / 0.9, 0, 1);
        const easedFall = fallProgress * fallProgress * (3 - 2 * fallProgress);
        piece.group.position.y = -easedFall * 0.26;
        piece.group.rotation.set(
          victorySceneState.baseRotation.x,
          victorySceneState.baseRotation.y + Math.sin(victoryTime * 3) * 0.08,
          victorySceneState.baseRotation.z + easedFall * (Math.PI / 2)
        );
      } else {
        piece.group.position.y = 0;
        piece.group.rotation.copy(victorySceneState.baseRotation);
      }
    } else if (moving && diceMove.phase === 'moving') {
      const progress = THREE.MathUtils.clamp((elapsed - diceMove.stepStartedAt) / 0.52, 0, 1);
      updateConeJump(piece, progress);
      piece.group.position.lerpVectors(diceMove.stepFrom, diceMove.stepTo, progress);
      piece.group.position.y = 0.48 + Math.sin(progress * Math.PI) * 0.85;
      piece.group.getWorldPosition(pieceWorldPosition);
      pieceWorldPosition.y += 1.1;
      focusFollowDelta.subVectors(pieceWorldPosition, cameraState.focusTarget);
      cameraState.focusTarget.add(focusFollowDelta);
      cameraState.focusPosition.add(focusFollowDelta);
      if (progress >= 1) {
        piece.group.position.copy(diceMove.stepTo);
        diceMove.nextHouse = piece.targetHouseId;
        piece.houseId = diceMove.nextHouse;
        if (!advanceMovement(gameState, diceMove.teamRecord.id, diceMove.nextHouse)) {
          console.error('Não foi possível atualizar a posição lógica durante a animação.');
        }
        diceMove.remaining -= 1;
        cameraState.houseId = diceMove.nextHouse;
        const movementVerb = diceMove.direction < 0 ? 'recuou' : 'avançou';
        pushHistory(`${diceMove.teamRecord.name} ${movementVerb} para a casa ${diceMove.nextHouse}`);
        updateGameHud();
        diceMove.phase = diceMove.remaining > 0 ? 'pause' : 'arrival';
        diceMove.resumeAt = elapsed + (diceMove.remaining > 0 ? 0.26 : 0.65);
      }
    } else if (moving && diceMove.phase === 'pause' && elapsed >= diceMove.resumeAt) {
      const nextHouse = Math.max(1, Math.min(60, diceMove.nextHouse + diceMove.direction));
      piece.targetHouseId = nextHouse;
      diceMove.stepFrom.copy(piece.group.position);
      diceMove.stepTo.copy(getPawnTargetPosition(piece, nextHouse));
      diceMove.stepStartedAt = elapsed;
      diceMove.phase = 'moving';
    } else if (moving && diceMove.phase === 'arrival' && elapsed >= diceMove.resumeAt) {
      const completedMove = diceMove;
      const arrivedHouse = completedMove.lastHouse;
      diceMove = null;
      if (!completeMovement(gameState, completedMove.teamRecord.id)) {
        console.error('Não foi possível concluir o movimento do peão.');
        return;
      }
      if (completedMove.primary) {
        setTimeout(() => openHouseAction(arrivedHouse), 180);
      } else {
        completedMove.onComplete?.();
      }
    } else if (!moving) {
      const celebrating = victorySceneState?.piece === piece;
      piece.cone.scale.set(1, celebrating ? 1 + Math.max(0, Math.sin((elapsed - victorySceneState.startedAt) * 5.2)) * 0.08 : 1, 1);
      piece.cone.position.y = piece.coneBaseY + 1.45 / 2;
      if (piece.head) piece.head.position.y = piece.headBaseY;
      const target = getPawnTargetPosition(piece, piece.targetHouseId);
      if (celebrating) {
        const celebrationTime = elapsed - victorySceneState.startedAt;
        piece.group.position.x = victorySceneState.basePosition.x;
        piece.group.position.y = victorySceneState.basePosition.y + Math.max(0, Math.sin(celebrationTime * 3.8)) * 0.48;
        piece.group.position.z = victorySceneState.basePosition.z;
      } else {
        piece.group.position.x += (target.x - piece.group.position.x) * 0.045;
        piece.group.position.y = 0.48 + Math.sin(elapsed * 2.2 + piece.phase) * 0.04;
        piece.group.position.z += (target.z - piece.group.position.z) * 0.045;
      }
    }
    if (victorySceneState?.piece !== piece) piece.group.rotation.y = elapsed * 0.7 + piece.phase;
    const distance = camera.position.distanceTo(piece.group.position);
    const portrait = pawnPortraits.get(piece.teamId);
    if (portrait) {
      portrait.group.visible = victorySceneState?.piece === piece
        ? false
        : (occupantsByHouse.get(piece.targetHouseId)?.length ?? 0) < 2;
      const inFocus = cameraState.mode === 'FOCUS_HOUSE';
      const pulse = 1 + Math.sin(elapsed * 2.1 + piece.phase) * 0.025;
      const distanceScale = THREE.MathUtils.clamp(1.2 + distance / 42, 1.75, 4.8);
      const visibility = inFocus ? 0.08 : THREE.MathUtils.clamp(0.72 + (distance - 18) / 90, 0.72, 0.96);
      const portraitScale = inFocus ? 0.04 : distanceScale;
      portrait.group.position.y = 1.55 + portraitScale * 1.02 + Math.sin(elapsed * 1.8 + piece.phase) * 0.045 * portraitScale;
      portrait.group.scale.setScalar(portraitScale * pulse);
      portrait.balloon.material.opacity = visibility * 0.82;
      portrait.portrait.material.opacity = visibility;
    }
  });
  houses.forEach(house => {
    const selected = cameraState.mode === 'FOCUS_HOUSE' && house.id === cameraState.houseId;
    house.glow.material.opacity = selected ? 0.18 + Math.sin(elapsed * 2.4) * 0.04 : 0.1;
    house.glow.scale.setScalar(selected ? 0.9 + Math.sin(elapsed * 2.4) * 0.06 : 0.7);
    house.ring.material.opacity = selected ? 0.62 : 0.38;
    const beacon = house.beacon;
    const pulse = 1 + Math.sin(elapsed * 1.8 + beacon.phase) * 0.12;
    const inFocus = cameraState.mode === 'FOCUS_HOUSE';
    const isFocusTarget = inFocus && house.id === cameraState.houseId;
    let fade = 1;
    if (inFocus) fade = isFocusTarget ? 0.14 : 0.22;
    beacon.core.scale.setScalar(0.22 * pulse * fade);
    beacon.core.material.opacity = 0.72 * fade;
    beacon.halo.scale.set(0.38 * pulse * fade, 0.38 * pulse * fade, 1);
    beacon.halo.material.opacity = 0.22 * fade;
    beacon.label.material.opacity = 0.78 * fade;
  });
  rainLayers.forEach(layer => {
    layer.rain.position.set(
      camera.position.x + Math.sin(elapsed * 0.025 + layer.drift) * 16,
      camera.position.y - layer.height * 0.5,
      camera.position.z + Math.cos(elapsed * 0.02 + layer.drift) * 16
    );
    const position = layer.rain.geometry.attributes.position.array;
    for (let index = 1, drop = 0; index < position.length; index += 3, drop += 1) {
      position[index] -= layer.velocities[drop] * (delta * 60);
      position[index + 1] += layer.velocities[drop] * 0.12 * (delta * 60);
      if (position[index] < 0) {
        position[index] = layer.height;
        position[index + 1] = (Math.random() - 0.5) * layer.spread;
      }
    }
    layer.rain.geometry.attributes.position.needsUpdate = true;
  });
  animatedVehicles.forEach(vehicle => {
    vehicle.offset = (vehicle.offset + delta * vehicle.speed) % 1;
    vehicle.mesh.position.copy(vehicle.curve.getPointAt(vehicle.offset));
    vehicle.mesh.position.y += Math.sin(elapsed * 2 + vehicle.offset * 10) * 0.03;
    vehicle.mesh.lookAt(vehicle.curve.getPointAt((vehicle.offset + 0.01) % 1));
  });
  particles.forEach(particle => { particle.rotation.y = elapsed * 0.006; });
  hologramSpinners.forEach((mesh, index) => { mesh.rotation.y = elapsed * (index % 2 ? -0.35 : 0.35); });
  glitchBars.forEach(glitch => {
    if (glitch.until < elapsed && Math.random() < 0.012) glitch.until = elapsed + 0.04 + Math.random() * 0.16;
    glitch.mesh.material.opacity = glitch.until > elapsed ? 0.16 : 0;
  });
  const event = gameState.activeEvent;
  bloomPass.strength = event === 'NETWORK_OVERLOAD' ? 0.72 : event === 'BLACKOUT' ? 0.25 : 0.55;
  bloomPass.threshold = event === 'GLOBAL_VIRUS' ? 0.72 : 1.05;
  cityLights.forEach(streetLight => {
    const eventFactor = event === 'BLACKOUT' ? 0.35 : event === 'NETWORK_TURBO' ? 1.15 : 1;
    streetLight.light.intensity = streetLight.base * eventFactor * (0.76 + Math.sin(elapsed * 1.15 + streetLight.phase) * 0.14);
  });
  if (elapsed - lastMessage > 8) {
    lastMessage = elapsed;
    statusMessage.textContent = messages[Math.floor(Math.random() * messages.length)];
  }
  composer.render();
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(diceForegroundScene, diceForegroundCamera);
  renderer.autoClear = true;
  requestAnimationFrame(animate);
}
animate();
