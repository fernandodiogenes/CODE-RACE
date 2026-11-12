import * as THREE from 'three';

// Landmarks geométricos leves (sem texturas/imagens) para os distritos que ainda não tinham um
// marco reconhecível pela SILHUETA — District Zero, Cyber Alley e Neon District — mais a ponte
// estaiada que conecta dois distritos. Black Market e Central Nexus já têm os seus (ver
// black-market-landmark.js e addCentralNexusMonuments em neon-city.js).
// Convenção: mesma forma de retorno que buildingComposer.compose() — um THREE.Group pronto para
// registerBuildingOccluder() e para entrar no sistema de LOD via userData.visualLod por mesh.

function setLod(object, level) {
  object.userData.visualLod = level;
  return object;
}

function box(geo, key, w, h, d, material, level = 'medium') {
  if (!geo.has(key)) geo.set(key, new THREE.BoxGeometry(w, h, d));
  return setLod(new THREE.Mesh(geo.get(key), material), level);
}

// DISTRICT ZERO — torre de rádio treliçada, discreta, com luz vermelha de aviso piscando no
// topo (regra de rooftop da direção de arte: todo prédio acima de 0.45H tem esse sinal).
export function createRadioTowerLandmark({ x, z, geo = new Map(), mat = {} }) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.userData.landmark = 'district-zero-radio-tower';

  const metal = mat.metal ?? new THREE.MeshStandardMaterial({ color: 0x2a3946, roughness: 0.55, metalness: 0.75 });
  const base = box(geo, 'lm-radio-base', 1.4, 1.2, 1.4, metal, 'far');
  base.position.y = 0.6;
  group.add(base);

  // Treliça: 4 pernas inclinadas convergindo para o topo, ligadas por travessas horizontais.
  const legHeight = 22;
  const legGeometry = geo.get('lm-radio-leg') ?? geo.set('lm-radio-leg', new THREE.CylinderGeometry(0.07, 0.12, legHeight, 4)).get('lm-radio-leg');
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const leg = setLod(new THREE.Mesh(legGeometry, metal), 'far');
    leg.position.set(sx * 0.55, 1.2 + legHeight / 2, sz * 0.55);
    leg.rotation.z = sx * 0.05;
    leg.rotation.x = -sz * 0.05;
    group.add(leg);
  });
  const rungGeometry = geo.get('lm-radio-rung') ?? geo.set('lm-radio-rung', new THREE.BoxGeometry(1.3, 0.05, 0.05)).get('lm-radio-rung');
  for (let i = 0; i < 5; i += 1) {
    const y = 3 + i * 4;
    const scale = 1 - (y / (legHeight + 1.2)) * 0.5;
    [0, Math.PI / 2].forEach(rot => {
      const rung = setLod(new THREE.Mesh(rungGeometry, metal), 'medium');
      rung.scale.x = scale;
      rung.position.y = y;
      rung.rotation.y = rot;
      group.add(rung);
    });
  }

  // Antena vertical fina no topo.
  const spireHeight = 3.5;
  const spire = box(geo, 'lm-radio-spire', 0.06, spireHeight, 0.06, metal, 'far');
  spire.position.y = legHeight + 1.2 + spireHeight / 2;
  group.add(spire);

  return group;
}

// CYBER ALLEY — torre-lâmina fina e alta com o maior outdoor vertical da cidade na face
// principal (≈75% da altura), reforçando a leitura "beco denso e vertical" do distrito.
export function createBladeTowerLandmark({ x, z, windows, geo = new Map(), mat = {} }) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.userData.landmark = 'cyber-alley-blade-tower';

  const concrete = mat.concrete ?? new THREE.MeshStandardMaterial({ color: 0x1c2430, roughness: 0.85, metalness: 0.2 });
  const metal = mat.metal ?? new THREE.MeshStandardMaterial({ color: 0x2a3946, roughness: 0.5, metalness: 0.78 });
  const towerHeight = 30;
  const towerWidth = 3.4;
  const towerDepth = 2.2;
  const tower = box(geo, 'lm-blade-tower', towerWidth, towerHeight, towerDepth, concrete, 'far');
  tower.position.y = towerHeight / 2;
  group.add(tower);

  // Núcleo/lâmina secundária, ligeiramente deslocada — silhueta de "duas lâminas" da direção de arte.
  const bladeHeight = towerHeight * 0.82;
  const blade = box(geo, 'lm-blade-secondary', towerWidth * 0.32, bladeHeight, towerDepth * 1.4, metal, 'far');
  blade.position.set(towerWidth * 0.55, bladeHeight / 2, 0);
  group.add(blade);

  // Janelas esparsas na lâmina principal (poucas, agrupadas — 25-40% acesas por bloco).
  const windowGeometry = geo.get('lm-blade-window') ?? geo.set('lm-blade-window', new THREE.PlaneGeometry(0.4, 0.6)).get('lm-blade-window');
  const rows = Math.floor(towerHeight / 2.4);
  for (let row = 0; row < rows; row += 1) {
    if (Math.random() > 0.32) continue;
    const material = new THREE.MeshStandardMaterial({ color: 0x334454, roughness: 0.72, metalness: 0.08 });
    const light = setLod(new THREE.Mesh(windowGeometry, material), 'medium');
    light.position.set(-towerWidth * 0.15, 1.5 + row * 2.4, -towerDepth / 2 - 0.02);
    group.add(light);
    windows.push({ mesh: light, base: material.opacity, phase: Math.random() * 9 });
  }

  // Cobertura simples com antena — telhado nunca vazio.
  const roofCap = box(geo, 'lm-blade-roof', towerWidth + 0.1, 0.14, towerDepth + 0.1, mat.roof ?? metal, 'medium');
  roofCap.position.y = towerHeight + 0.07;
  group.add(roofCap);
  const antennaGeometry = geo.get('lm-blade-antenna') ?? geo.set('lm-blade-antenna', new THREE.CylinderGeometry(0.03, 0.05, 2.2, 4)).get('lm-blade-antenna');
  const antenna = setLod(new THREE.Mesh(antennaGeometry, metal), 'medium');
  antenna.position.set(0, towerHeight + 1.1, 0);
  group.add(antenna);

  return group;
}

// NEON DISTRICT — torre com elemento holográfico rotativo no topo (plano translúcido com
// scanlines simuladas por opacidade baixa, sem imagem/textura — só geometria + emissive).
export function createHologramTowerLandmark({ x, z, geo = new Map(), mat = {} }) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.userData.landmark = 'neon-district-hologram-tower';

  const metal = mat.metal ?? new THREE.MeshStandardMaterial({ color: 0x2a2438, roughness: 0.5, metalness: 0.7 });
  const glass = mat.glass ?? new THREE.MeshStandardMaterial({ color: 0x3a2a52, roughness: 0.25, metalness: 0.5, transparent: true, opacity: 0.8 });
  const towerHeight = 26;
  const tower = box(geo, 'lm-holo-tower', 5.4, towerHeight, 5.4, glass, 'far');
  tower.position.y = towerHeight / 2;
  group.add(tower);

  // Coroa em balanço (mais larga que o corpo) sustentando o holograma.
  const crownHeight = towerHeight * 0.12;
  const crown = box(geo, 'lm-holo-crown', 6.6, crownHeight, 6.6, metal, 'far');
  crown.position.y = towerHeight + crownHeight / 2;
  group.add(crown);

  // Haste central; o holograma luminoso foi removido para manter a torre não emissiva.
  const maskHeight = towerHeight + crownHeight;
  const mastGeometry = geo.get('lm-holo-mast') ?? geo.set('lm-holo-mast', new THREE.CylinderGeometry(0.08, 0.1, 4, 6)).get('lm-holo-mast');
  const mast = setLod(new THREE.Mesh(mastGeometry, metal), 'far');
  mast.position.y = maskHeight + 2;
  group.add(mast);

  return group;
}

// PONTE ESTAIADA — conecta dois pontos (tipicamente entre distritos), com cabos brancos/cyan
// convergindo para dois mastros. Geometria pura, sem textura — a "leitura" vem da silhueta dos
// mastros + linhas de cabo, como na referência do skyline com rio.
export function createStayedBridge({ from, to, mat = {} }) {
  const group = new THREE.Group();
  const metal = mat.metal ?? new THREE.MeshStandardMaterial({ color: 0x2c3947, roughness: 0.5, metalness: 0.75 });
  const deckMaterial = mat.deck ?? new THREE.MeshStandardMaterial({ color: 0x1c242e, roughness: 0.7, metalness: 0.4 });

  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const length = start.distanceTo(end);
  const angle = Math.atan2(end.x - start.x, end.z - start.z);

  const deck = setLod(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, length), deckMaterial), 'far');
  deck.position.copy(mid);
  deck.rotation.y = angle;
  group.add(deck);

  const pylonHeight = 16;
  const cableMaterial = new THREE.LineBasicMaterial({ color: 0xbdeff2, transparent: true, opacity: 0.55 });
  [0.28, 0.72].forEach(t => {
    const base = start.clone().lerp(end, t);
    const pylon = setLod(new THREE.Mesh(new THREE.BoxGeometry(0.6, pylonHeight, 0.6), metal), 'far');
    pylon.position.set(base.x, pylonHeight / 2, base.z);
    group.add(pylon);
    for (let i = 0; i < 6; i += 1) {
      const spanT = t < 0.5 ? t + (i / 6) * (1 - t) * 0.9 : t - (i / 6) * t * 0.9;
      const anchor = start.clone().lerp(end, THREE.MathUtils.clamp(spanT, 0, 1));
      const points = [new THREE.Vector3(base.x, pylonHeight, base.z), new THREE.Vector3(anchor.x, 0.4, anchor.z)];
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), cableMaterial));
    }
  });

  return group;
}
