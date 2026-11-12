import * as THREE from 'three';

// Prova de conceito: UM prédio do Black Market inteiramente modelado com geometria nativa
// do Three.js (sem texturas de fachada). Cada função monta um módulo reutilizável — o objetivo
// é, mais tarde, gerar variações trocando dimensões/paleta sem tocar na estrutura do código.
//
// Convenções:
//  - mesh.userData.visualLod = 'far' | 'medium' | 'near' (mesmo esquema do sistema de LOD em neon-city.js).
//  - toda cor viva fica em materiais MeshBasicMaterial (emissivos/luz própria); a massa do prédio
//    usa MeshStandardMaterial escuro (concreto/metal), para não ficar monocromático nem "brilhar" inteiro.
//  - o grupo retornado tem a MESMA forma que buildingComposer.compose() devolve, então entra direto
//    em registerBuildingOccluder() e no sistema de LOD sem nenhuma mudança nesses sistemas.

const PALETTE = {
  cyan: 0x4ee6e4,
  magenta: 0xff4fd8,
  red: 0xf04f62,
  amber: 0xe6a85e,
  green: 0x8edb79,
  deepBlue: 0x1c3a52
};

function setLod(object, level) {
  object.userData.visualLod = level;
  return object;
}

function box(geometryCache, w, h, d, material, level = 'medium') {
  const key = `bm-box:${w}:${h}:${d}`;
  if (!geometryCache.has(key)) geometryCache.set(key, new THREE.BoxGeometry(w, h, d));
  return setLod(new THREE.Mesh(geometryCache.get(key), material), level);
}

// ESTRUTURA — três volumes de profundidades e larguras levemente diferentes, empilhados e
// deslocados, para que a SILHUETA já seja irregular sem depender de nenhum detalhe de superfície.
function buildStructure(ctx) {
  const { group, geo, mat } = ctx;
  const massA = box(geo, 6.4, 9.5, 5.6, mat.concreteDark, 'far');
  massA.position.set(0, 4.75, 0);
  group.add(massA);

  // recuo lateral, mais raso e mais baixo — quebra a simetria em planta
  const massB = box(geo, 3.2, 6.8, 4.4, mat.concreteMid, 'far');
  massB.position.set(-4.1, 3.4, -0.5);
  group.add(massB);

  // volume alto e estreito, avançado na frente — a marca reconhecível da silhueta
  const massC = box(geo, 2.4, 13.5, 3.1, mat.metalDark, 'far');
  massC.position.set(3.1, 6.75, 1.4);
  group.add(massC);

  // pequena saliência técnica no topo do volume A (caixa d'água / casa de máquinas)
  const cap = box(geo, 2.6, 1.8, 2.6, mat.metalDark, 'medium');
  cap.position.set(0.4, 10.4, -0.6);
  cap.rotation.y = 0.18;
  group.add(cap);

  ctx.bounds = { massA, massB, massC };
  return { topA: 9.5, topB: 6.8, topC: 13.5 };
}

// SACADAS / PLATAFORMAS — pequenas lajes salientes com guarda-corpo, típicas de reforma informal.
function buildBalconies(ctx) {
  const { group, geo, mat } = ctx;
  const spots = [
    { x: 3.25, y: 3.6, z: 1.4, w: 1.6, side: 1 },
    { x: 3.25, y: 7.1, z: 1.4, w: 1.4, side: 1 },
    { x: -5.75, y: 4.6, z: -0.5, w: 1.3, side: -1 }
  ];
  spots.forEach(spot => {
    const slab = box(geo, spot.w, 0.12, 1.3, mat.metalMid, 'medium');
    slab.position.set(spot.x + spot.side * spot.w * 0.5, spot.y, spot.z);
    group.add(slab);
    const rail = box(geo, spot.w, 0.7, 0.05, mat.metalMid, 'medium');
    rail.position.set(slab.position.x, spot.y + 0.4, spot.z + 0.65);
    group.add(rail);
  });
}

// JANELAS — agrupadas por volume, cada uma com cor e opacidade próprias; parte fica apagada.
function buildWindows(ctx, tops) {
  const { group, geo, mat, ctxState } = ctx;
  const key = 'bm-window';
  if (!geo.has(key)) geo.set(key, new THREE.PlaneGeometry(0.5, 0.72));
  const windowGeometry = geo.get(key);
  const addWindowGrid = (originX, originZ, faceNormalY, width, rows, cols, spacingY, rowStart) => {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const material = new THREE.MeshStandardMaterial({ color: 0x334454, roughness: 0.72, metalness: 0.08 });
        const light = new THREE.Mesh(windowGeometry, material);
        setLod(light, 'medium');
        light.position.set(originX + (col - (cols - 1) / 2) * 0.85, rowStart + row * spacingY, originZ + faceNormalY);
        light.rotation.y = faceNormalY > 0 ? 0 : Math.PI;
        group.add(light);
      }
    }
  };

  // volume A (frente, -Z): 3 colunas x várias fileiras
  addWindowGrid(0, -2.82, -0.02, 6.4, Math.floor(tops.topA / 2.3), 3, 2.3, 1.5);
  // volume B (lateral -X, face -Z): grupo menor
  addWindowGrid(-4.1, -2.72, -0.02, 3.2, Math.floor(tops.topB / 2.1), 2, 2.1, 1.6);
  // volume C (torre estreita, face -Z): coluna única — reforça a verticalidade
  addWindowGrid(3.1, -1.58, -0.02, 2.4, Math.floor(tops.topC / 1.9), 1, 1.9, 1.6);
}

// ELEMENTOS TÉCNICOS — tubos, cabos e ar-condicionados, concentrados nas quinas e recuos.
function buildTechnical(ctx, tops) {
  const { group, geo, mat } = ctx;
  const pipeKey = 'bm-pipe';
  if (!geo.has(pipeKey)) geo.set(pipeKey, new THREE.CylinderGeometry(0.06, 0.06, 8, 5));
  [[-3.35, -2.6], [-2.9, -2.75]].forEach(([x, z], i) => {
    const pipe = new THREE.Mesh(geo.get(pipeKey), mat.rust);
    setLod(pipe, 'medium');
    pipe.scale.y = (tops.topA - 0.6) / 8;
    pipe.position.set(x, (tops.topA - 0.6) / 2, z - i * 0.15);
    group.add(pipe);
  });

  // unidades de ar-condicionado agrupadas sob as janelas do volume A
  const acKey = 'bm-ac';
  if (!geo.has(acKey)) geo.set(acKey, new THREE.BoxGeometry(0.52, 0.36, 0.32));
  for (let i = 0; i < 5; i += 1) {
    const ac = new THREE.Mesh(geo.get(acKey), mat.metalMid);
    setLod(ac, 'medium');
    ac.position.set(-2 + i * 1, 2.3 + (i % 2) * 3.6, -2.95);
    group.add(ac);
  }

  // cabos entre a torre estreita e o volume principal (linha simples, custo mínimo)
  const cableMaterial = new THREE.LineBasicMaterial({ color: 0x2f4452, transparent: true, opacity: 0.55 });
  const cablePoints = [
    new THREE.Vector3(2.0, tops.topA - 0.4, -1.4),
    new THREE.Vector3(2.6, tops.topA + 1.1, 0.2),
    new THREE.Vector3(2.9, tops.topC - 0.5, 1.2)
  ];
  const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints(cablePoints), cableMaterial);
  setLod(cable, 'near');
  group.add(cable);
}

// MARQUISE — alpendre metálico irregular no térreo, sobre a entrada.
function buildCanopy(ctx) {
  const { group, geo, mat } = ctx;
  const canopy = box(geo, 3.6, 0.14, 1.5, mat.metalMid, 'medium');
  canopy.position.set(-0.4, 2.5, -3.3);
  canopy.rotation.z = -0.035;
  group.add(canopy);
  const strutKey = 'bm-strut';
  if (!geo.has(strutKey)) geo.set(strutKey, new THREE.CylinderGeometry(0.035, 0.035, 1.1, 4));
  [-1.6, 1.6].forEach(offset => {
    const strut = new THREE.Mesh(geo.get(strutKey), mat.metalMid);
    setLod(strut, 'near');
    strut.position.set(-0.4 + offset, 1.95, -3.85);
    strut.rotation.x = 0.25;
    group.add(strut);
  });
}

// PAINEL LUMINOSO — placa retangular emissiva, com falha ocasional independente do letreiro.
function buildLightPanel(ctx) {
  const { group, geo, ctxState } = ctx;
  const key = 'bm-panel';
  if (!geo.has(key)) geo.set(key, new THREE.PlaneGeometry(1.9, 2.6));
  const material = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const panel = new THREE.Mesh(geo.get(key), material);
  setLod(panel, 'near');
  panel.position.set(-4.1, 4.9, -2.73);
  group.add(panel);
  ctxState.facadeLights.push({ mesh: panel, base: 0.5, phase: Math.random() * 4, glitch: true });
}

// LETREIRO — placa vertical saliente ("blade sign"), comportamento independente do painel.
function buildSign(ctx) {
  const { group, geo, ctxState } = ctx;
  const key = 'bm-sign';
  if (!geo.has(key)) geo.set(key, new THREE.PlaneGeometry(1.1, 3.4));
  const material = new THREE.MeshBasicMaterial({ color: PALETTE.magenta, transparent: true, opacity: 0.68, side: THREE.DoubleSide });
  const sign = new THREE.Mesh(geo.get(key), material);
  setLod(sign, 'near');
  sign.rotation.y = Math.PI / 2;
  sign.position.set(3.1 + 1.35, 5.4, 1.4);
  group.add(sign);
  ctxState.facadeLights.push({ mesh: sign, base: 0.68, phase: Math.random() * 4, glitch: false });

  // pequeno detalhe técnico não luminoso ao lado do letreiro.
  const ledKey = 'bm-led';
  if (!geo.has(ledKey)) geo.set(ledKey, new THREE.SphereGeometry(0.06, 6, 6));
  const led = new THREE.Mesh(geo.get(ledKey), new THREE.MeshStandardMaterial({ color: 0x334454, roughness: 0.72, metalness: 0.08 }));
  setLod(led, 'near');
  led.position.set(3.1 + 0.05, 6.1, 1.4 + 1.58);
  group.add(led);
}

// COBERTURA — telhados a alturas diferentes (um por volume) e pequenos elementos técnicos no topo.
function buildRoofs(ctx, tops) {
  const { group, geo, mat } = ctx;
  const roofA = box(geo, 6.6, 0.14, 5.8, mat.roofDark, 'medium');
  roofA.position.set(0, tops.topA + 0.07, 0);
  group.add(roofA);
  const roofB = box(geo, 3.4, 0.12, 4.6, mat.roofDark, 'medium');
  roofB.position.set(-4.1, tops.topB + 0.06, -0.5);
  group.add(roofB);
  const roofC = box(geo, 2.6, 0.1, 3.3, mat.roofDark, 'medium');
  roofC.position.set(3.1, tops.topC + 0.05, 1.4);
  group.add(roofC);

  // antena e um pequeno tanque, deslocados do centro para reforçar a silhueta irregular
  const antennaKey = 'bm-antenna';
  if (!geo.has(antennaKey)) geo.set(antennaKey, new THREE.CylinderGeometry(0.03, 0.05, 2.6, 4));
  const antenna = new THREE.Mesh(geo.get(antennaKey), mat.metalMid);
  setLod(antenna, 'medium');
  antenna.position.set(3.1 + 0.5, tops.topC + 1.35, 1.4 - 0.4);
  group.add(antenna);

  const tankKey = 'bm-tank';
  if (!geo.has(tankKey)) geo.set(tankKey, new THREE.CylinderGeometry(0.55, 0.55, 1.1, 8));
  const tank = new THREE.Mesh(geo.get(tankKey), mat.rust);
  setLod(tank, 'medium');
  tank.position.set(-3.4, tops.topB + 0.6, -1.3);
  group.add(tank);
}

// Cria o grupo do prédio-landmark. `geometryCache`/`materialCache` são passados de fora para
// reaproveitar os mesmos Map usados pelos outros módulos (nenhuma geometria/material duplicado
// se este prédio for instanciado mais de uma vez no futuro).
export function createBlackMarketLandmark({ x, z, windows, facadeLights, geometryCache = new Map(), materialCache = new Map() }) {
  const mat = {
    concreteDark: materialCache.get('bm-concreteDark') ?? materialCache.set('bm-concreteDark', new THREE.MeshStandardMaterial({ color: 0x232c36, roughness: 0.95, metalness: 0.1 })).get('bm-concreteDark'),
    concreteMid: materialCache.get('bm-concreteMid') ?? materialCache.set('bm-concreteMid', new THREE.MeshStandardMaterial({ color: 0x2b3540, roughness: 0.92, metalness: 0.12 })).get('bm-concreteMid'),
    metalDark: materialCache.get('bm-metalDark') ?? materialCache.set('bm-metalDark', new THREE.MeshStandardMaterial({ color: 0x1c2530, roughness: 0.6, metalness: 0.65 })).get('bm-metalDark'),
    metalMid: materialCache.get('bm-metalMid') ?? materialCache.set('bm-metalMid', new THREE.MeshStandardMaterial({ color: 0x394654, roughness: 0.58, metalness: 0.7 })).get('bm-metalMid'),
    rust: materialCache.get('bm-rust') ?? materialCache.set('bm-rust', new THREE.MeshStandardMaterial({ color: 0x5c4238, roughness: 0.96, metalness: 0.15 })).get('bm-rust'),
    roofDark: materialCache.get('bm-roofDark') ?? materialCache.set('bm-roofDark', new THREE.MeshBasicMaterial({ color: 0x161c24 })).get('bm-roofDark')
  };

  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.userData.district = 'black-market';
  group.userData.landmark = 'black-market-01';

  const ctx = { group, geo: geometryCache, mat, ctxState: { windows, facadeLights } };
  const tops = buildStructure(ctx);
  buildBalconies(ctx);
  buildWindows(ctx, tops);
  buildTechnical(ctx, tops);
  buildCanopy(ctx);
  buildRoofs(ctx, tops);

  return group;
}
