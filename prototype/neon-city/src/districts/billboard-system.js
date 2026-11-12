import * as THREE from 'three';

// Sistema de billboards procedurais (geometria nativa, sem textura de imagem).
// Cada billboard é: moldura 3D + tela emissiva + tiras de LED + suportes/treliça + cabos pendurados.
// Distribuído por distrito com variedade de forma (horizontal/vertical/facade/treliça/pequeno/quebrado).
// Toda a cor viva fica em MeshBasicMaterial (emissivo); a moldura/estrutura usa metal escuro.

const geometryCache = new Map();
const materialCache = new Map();

function geo(key, create) {
  if (!geometryCache.has(key)) geometryCache.set(key, create());
  return geometryCache.get(key);
}

function mat(key, create) {
  if (!materialCache.has(key)) materialCache.set(key, create());
  return materialCache.get(key);
}

function frameMaterial() {
  return mat('bb-frame', () => new THREE.MeshStandardMaterial({ color: 0x1c232c, roughness: 0.6, metalness: 0.8 }));
}

function rustFrameMaterial() {
  return mat('bb-frame-rust', () => new THREE.MeshStandardMaterial({ color: 0x4a362c, roughness: 0.9, metalness: 0.35 }));
}

// Tela do outdoor: cor multiplicada acima de 1.0 (HDR) para estourar no UnrealBloomPass — os
// outdoors são a principal fonte de cor do skyline, então devem ser o elemento mais "forte".
function screenMaterial(color) {
  return mat(`bb-screen:${color}`, () => new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(2.6), transparent: true, opacity: 0.92, side: THREE.DoubleSide, toneMapped: false
  }));
}

function ledMaterial(color) {
  return mat(`bb-led:${color}`, () => new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: 1, toneMapped: false
  }));
}

function box(w, h, d, material, lod = 'medium') {
  const key = `bb-box:${w}:${h}:${d}`;
  const mesh = new THREE.Mesh(geo(key, () => new THREE.BoxGeometry(w, h, d)), material);
  mesh.userData.visualLod = lod;
  return mesh;
}

function plane(w, h, material, lod = 'near') {
  const key = `bb-plane:${w}:${h}`;
  const mesh = new THREE.Mesh(geo(key, () => new THREE.PlaneGeometry(w, h)), material);
  mesh.userData.visualLod = lod;
  return mesh;
}

function strut(len, material, lod = 'medium') {
  const key = `bb-strut:${len}`;
  const mesh = new THREE.Mesh(geo(key, () => new THREE.CylinderGeometry(0.045, 0.06, len, 5)), material);
  mesh.userData.visualLod = lod;
  return mesh;
}

// Cabo pendurado (linha simples, custo mínimo).
function hangingCable(from, to, sag, color = 0x1a222b) {
  const mid = new THREE.Vector3((from.x + to.x) / 2, Math.min(from.y, to.y) - sag, (from.z + to.z) / 2);
  const curve = new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone());
  const points = curve.getPoints(6);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
  line.userData.visualLod = 'near';
  return line;
}

// LED strip: fileira de pequenos segmentos emissivos ao longo de uma aresta.
function ledStrip(length, count, color, axis = 'x') {
  const group = new THREE.Group();
  const segGeo = geo('bb-led-seg', () => new THREE.BoxGeometry(0.14, 0.05, 0.05));
  const material = ledMaterial(color);
  for (let i = 0; i < count; i += 1) {
    const seg = new THREE.Mesh(segGeo, material);
    seg.userData.visualLod = 'medium';
    const t = (i / Math.max(1, count - 1) - 0.5) * length;
    if (axis === 'x') seg.position.x = t; else seg.position.y = t;
    group.add(seg);
  }
  return group;
}

function pick(list, rng = Math.random) { return list[Math.floor(rng() * list.length)]; }
function range(min, max, rng = Math.random) { return min + rng() * (max - min); }

// Constrói um billboard procedural do tipo pedido e retorna { group, panels } onde panels é a
// lista de { mesh, phase, base, kind } usada pela animação independente por instância.
function buildBillboard({ kind, width, height, colors, damaged, scaffold, frame = 'metal' }) {
  const group = new THREE.Group();
  const panels = [];
  const frameMat = frame === 'rust' ? rustFrameMaterial() : frameMaterial();
  const primary = pick(colors);
  const secondary = colors.length > 1 ? pick(colors.filter(c => c !== primary)) || primary : primary;

  // Moldura
  const border = box(width + 0.28, height + 0.28, 0.14, frameMat, 'medium');
  group.add(border);

  // Tela emissiva principal (pode estar "quebrada" — só parte da tela acesa, com fissuras escuras)
  if (!damaged) {
    const screen = plane(width, height, screenMaterial(primary), 'near');
    screen.position.z = 0.09;
    group.add(screen);
    panels.push({ mesh: screen, base: 0.92, phase: Math.random() * Math.PI * 2, kind: 'screen', color: primary });
  } else {
    const cols = 3;
    const rows = 2;
    const cellW = width / cols;
    const cellH = height / rows;
    for (let cx = 0; cx < cols; cx += 1) {
      for (let cy = 0; cy < rows; cy += 1) {
        const alive = Math.random() < 0.6;
        const cell = plane(cellW * 0.92, cellH * 0.92, screenMaterial(alive ? primary : 0x0a0d10), 'near');
        cell.position.set((cx - (cols - 1) / 2) * cellW, (cy - (rows - 1) / 2) * cellH, 0.09);
        group.add(cell);
        if (alive) panels.push({ mesh: cell, base: 0.85, phase: Math.random() * Math.PI * 2, kind: 'screen-cell', color: primary, flickerHeavy: true });
      }
    }
  }

  // LED trim ao redor da moldura (topo e base)
  const stripTop = ledStrip(width * 0.86, Math.max(3, Math.round(width * 1.4)), secondary, 'x');
  stripTop.position.set(0, height / 2 + 0.14, 0.1);
  group.add(stripTop);
  stripTop.children.forEach(seg => panels.push({ mesh: seg, base: 1, phase: Math.random() * Math.PI * 2, kind: 'led' }));

  const stripBottom = ledStrip(width * 0.86, Math.max(3, Math.round(width * 1.4)), secondary, 'x');
  stripBottom.position.set(0, -height / 2 - 0.14, 0.1);
  group.add(stripBottom);
  stripBottom.children.forEach(seg => panels.push({ mesh: seg, base: 1, phase: Math.random() * Math.PI * 2, kind: 'led' }));

  // Suportes / treliça
  if (scaffold) {
    const legHeight = height * 0.6;
    [-1, 1].forEach(side => {
      const leg = strut(legHeight, frameMat, 'medium');
      leg.position.set(side * width * 0.42, -height / 2 - legHeight / 2, -0.1);
      group.add(leg);
      const diag = strut(legHeight * 0.75, frameMat, 'medium');
      diag.rotation.z = side * 0.5;
      diag.position.set(side * width * 0.24, -height / 2 - legHeight * 0.42, -0.1);
      group.add(diag);
    });
    // treliça horizontal extra ligando as pernas
    const bar = box(width * 0.8, 0.08, 0.08, frameMat, 'medium');
    bar.position.set(0, -height / 2 - legHeight * 0.85, -0.1);
    group.add(bar);
  } else {
    // pequenos suportes traseiros simples
    [-1, 1].forEach(side => {
      const bracket = strut(0.6, frameMat, 'medium');
      bracket.rotation.x = Math.PI / 2;
      bracket.position.set(side * width * 0.36, 0, -0.35);
      group.add(bracket);
    });
  }

  // Cabos pendurados
  const cableColor = 0x161c22;
  group.add(hangingCable(new THREE.Vector3(-width / 2, height / 2, 0.1), new THREE.Vector3(-width / 2 - 0.4, -height * 0.1, 0.1), 0.5, cableColor));
  group.add(hangingCable(new THREE.Vector3(width / 2, height / 2, 0.1), new THREE.Vector3(width / 2 + 0.4, -height * 0.1, 0.1), 0.5, cableColor));

  group.userData.kind = kind;
  return { group, panels };
}

// Perfis de billboard por distrito: densidade, tamanhos, orientação preferida, aparência.
const DISTRICT_BILLBOARD_PROFILES = [
  { // District Zero — poucos, velhos/desgastados
    count: 5, sizeRange: [[2.2, 1.2], [3.4, 1.8]], damagedChance: 0.55, scaffoldChance: 0.3,
    orientation: 'mixed', frame: 'rust', colorSets: [[0x4ee6e4], [0xe6a85e], [0x4ee6e4, 0xe6a85e]]
  },
  { // Cyber Alley — muitos, majoritariamente verticais
    count: 16, sizeRange: [[1.4, 3.2], [2, 5.2]], damagedChance: 0.12, scaffoldChance: 0.45,
    orientation: 'vertical', frame: 'metal', colorSets: [[0xb36cff], [0x4ee6e4], [0xb36cff, 0x4ee6e4]]
  },
  { // Black Market — numerosos, improvisados, coloridos, irregulares
    count: 18, sizeRange: [[1.2, 1.6], [3.6, 2.4]], damagedChance: 0.4, scaffoldChance: 0.6,
    orientation: 'mixed', frame: 'rust', colorSets: [[0xf04f62], [0xe6a85e], [0x8edb79], [0xff4fd8], [0xf04f62, 0xe6a85e], [0x8edb79, 0xff4fd8]]
  },
  { // Neon District — grandes, sofisticados
    count: 10, sizeRange: [[4.5, 2.6], [7.5, 4]], damagedChance: 0.04, scaffoldChance: 0.25,
    orientation: 'horizontal', frame: 'metal', colorSets: [[0x4ee6e4, 0xff4fa3], [0xb36cff, 0x4ee6e4], [0xff4fa3, 0xb36cff]]
  },
  { // Central Nexus — poucos, monumentais
    count: 4, sizeRange: [[6, 3.2], [9, 5]], damagedChance: 0, scaffoldChance: 0.1,
    orientation: 'horizontal', frame: 'metal', colorSets: [[0xbdeff2], [0xbdeff2, 0x4ee6e4]]
  }
];

// Gera billboards espalhados sobre os prédios já colocados (`placed`) de um distrito,
// e também exemplares "soltos entre prédios" apoiados em treliças no chão/lote vazio.
export function addBillboards({ city, placed, registerOccluder, districtIndexAt }) {
  const facadeLights = [];
  const bounds = { minX: -58, maxX: 58, minZ: -58, maxZ: 58 };

  DISTRICT_BILLBOARD_PROFILES.forEach((profile, districtIndex) => {
    const districtBuildings = placed.filter(item => item.districtIndex === districtIndex);
    if (!districtBuildings.length) return;

    for (let i = 0; i < profile.count; i += 1) {
      const [minW, minH] = profile.sizeRange[0];
      const [maxW, maxH] = profile.sizeRange[1];
      let width = range(minW, maxW);
      let height = range(minH, maxH);
      let vertical = profile.orientation === 'vertical' || (profile.orientation === 'mixed' && Math.random() < 0.5);
      if (vertical && width > height) { const t = width; width = height; height = t; }
      if (!vertical && height > width) { const t = width; width = height; height = t; }

      const damaged = Math.random() < profile.damagedChance;
      const scaffold = Math.random() < profile.scaffoldChance;
      const colors = pick(profile.colorSets);
      const { group, panels } = buildBillboard({ kind: `district-${districtIndex}`, width, height, colors, damaged, scaffold, frame: profile.frame });

      // Placement: metade nos telhados/fachadas de prédios existentes, metade em treliças
      // livres entre prédios (chão), para dar a leitura de "outdoor solto na rua".
      const onBuilding = Math.random() < 0.6;
      if (onBuilding) {
        const host = pick(districtBuildings);
        const wallMount = Math.random() < 0.45;
        if (wallMount) {
          // projetado na fachada, virado para a rua (perpendicular à parede)
          const side = pick([-1, 1]);
          group.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
          group.position.set(host.x + side * 3.2, range(4, 9), host.z + range(-2, 2));
        } else {
          // sobre o telhado, numa treliça
          group.position.set(host.x + range(-1.5, 1.5), range(9, 16), host.z + range(-1.5, 1.5));
          group.rotation.y = range(0, Math.PI * 2);
        }
      } else {
        // pequeno outdoor solto entre prédios, montado em poste/treliça baixa
        const x = THREE.MathUtils.clamp(pick(districtBuildings).x + range(-6, 6), bounds.minX, bounds.maxX);
        const z = THREE.MathUtils.clamp(pick(districtBuildings).z + range(-6, 6), bounds.minZ, bounds.maxZ);
        group.position.set(x, range(3, 6), z);
        group.rotation.y = range(0, Math.PI * 2);
      }

      city.add(group);
      registerOccluder(group);
      panels.forEach(panel => facadeLights.push({
        ...panel,
        glitch: damaged || Math.random() < 0.18,
        speed: 0.6 + Math.random() * 1.6,
        blackoutChance: damaged ? 0.006 : 0.0015
      }));
    }
  });

  return facadeLights;
}
