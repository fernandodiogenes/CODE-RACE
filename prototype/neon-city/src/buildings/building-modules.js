import * as THREE from 'three';

// Cada módulo recebe o contexto do prédio e adiciona suas peças em ctx.group.
// Quando o distrito não tem assets carregados para o módulo, ele usa o fallback procedural.

function scaledBox(ctx, material, [sx, sy, sz], [x, y, z], lod = 'medium') {
  const mesh = new THREE.Mesh(ctx.kit.assets.unitBox(), material);
  mesh.scale.set(sx, sy, sz);
  mesh.userData.visualLod = lod;
  mesh.position.set(x, y, z);
  return mesh;
}

function propsFor(ctx, placement) {
  return ctx.kit.assets.available('props', ctx.district.props)
    .filter(record => (record.definition.placement ?? 'street') === placement);
}

// ESTRUTURA / BASE — volume principal e massa lateral (também são o alvo do raycast de oclusão).
// O shell principal nunca muda de forma (fachada/janelas/sinalização dependem do footprint
// width×depth exato); a variedade de silhueta pedida pela direção de arte (escalonado, lâmina,
// coroa) entra como massa ADICIONAL acima do shell, só em prédios altos o bastante para valer
// a leitura de skyline — prédios médios/baixos continuam caixas simples.
const TALL_SILHOUETTE_THRESHOLD = 16;

function addSteppedSilhouette(ctx, height) {
  const { kit, width, depth, group } = ctx;
  const material = kit.materials[ctx.pick(ctx.arch.shellMaterials)];
  const setbacks = 2 + (ctx.chance(0.5) ? 1 : 0);
  let currentWidth = width;
  let currentDepth = depth;
  let currentTop = height;
  for (let i = 0; i < setbacks; i += 1) {
    currentWidth *= ctx.range(0.62, 0.78);
    currentDepth *= ctx.range(0.62, 0.78);
    const blockHeight = height * ctx.range(0.14, 0.22);
    const y = currentTop + blockHeight / 2;
    group.add(scaledBox(ctx, material, [currentWidth, blockHeight, currentDepth], [0, y, 0], 'far'));
    currentTop += blockHeight;
  }
  return currentTop;
}

function addBladeSilhouette(ctx, height) {
  const { kit, width, depth, group } = ctx;
  const material = kit.materials[ctx.pick(ctx.arch.shellMaterials)];
  const bladeWidth = width * 0.16;
  const bladeHeight = height * ctx.range(0.22, 0.4);
  [-1, 1].forEach(side => {
    group.add(scaledBox(ctx, material, [bladeWidth, bladeHeight, depth * 0.7], [side * width * 0.3, height + bladeHeight / 2, 0], 'far'));
  });
  return height + bladeHeight;
}

function addCrownSilhouette(ctx, height) {
  const { kit, width, depth, group } = ctx;
  const material = kit.materials[ctx.pick(ctx.arch.shellMaterials)];
  const crownHeight = height * ctx.range(0.1, 0.2);
  const crownScale = ctx.range(1.1, 1.25);
  group.add(scaledBox(ctx, material, [width * crownScale, crownHeight, depth * crownScale], [0, height + crownHeight / 2, 0], 'far'));
  return height + crownHeight;
}

const SILHOUETTES = { stepped: addSteppedSilhouette, blade: addBladeSilhouette, crown: addCrownSilhouette };

function structure(ctx) {
  const { arch, kit, width, height, depth, group } = ctx;
  const shell = scaledBox(ctx, kit.materials[ctx.pick(arch.shellMaterials)], [width, height, depth], [0, height / 2, 0], 'far');
  group.add(shell);
  if (ctx.chance(arch.sideMassChance)) {
    group.add(scaledBox(ctx, kit.materials.metal, [width * 0.38, height * ctx.range(0.34, 0.72), depth * 0.72], [width * 0.34, height * ctx.range(0.22, 0.45), depth * 0.08], 'far'));
  }
  ctx.state.silhouetteTop = height;
  if (height < TALL_SILHOUETTE_THRESHOLD) return;
  const options = arch.silhouettes ?? ['stepped', 'blade', 'crown'];
  const choice = ctx.pick(options);
  const build = SILHOUETTES[choice];
  if (build) ctx.state.silhouetteTop = build(ctx, height);
}

// A textura contorna o prédio de forma contínua (front → left → back → right), então as quinas
// não repetem o mesmo trecho; só o ponto de partida varia (alinhado às divisões de loja, se houver).
const PERIMETER = ['front', 'left', 'back', 'right'];
function facadeOffsets(ctx, record, sides, width, depth, tileWidth) {
  let cursor = ctx.pick(record.definition.segments ?? [0]);
  const offsets = {};
  PERIMETER.forEach(side => {
    offsets[side] = Math.round((cursor % 1) * 1000) / 1000;
    cursor += (side === 'front' || side === 'back' ? width : depth) / tileWidth;
  });
  return Object.fromEntries(sides.map(side => [side, offsets[side]]));
}

// FACHADA — faixas ground/upper texturizadas; lados podem misturar fachadas diferentes.
// Fachadas com wrap 'repeat-x' só repetem na horizontal: a faixa é limitada à altura da imagem
// (ancorada no chão) e o restante do prédio segue com o acabamento procedural.
function facade(ctx) {
  const { arch, kit, district, width, height, depth, group } = ctx;
  const ground = kit.assets.available('facades', district.facades.ground);
  const upper = kit.assets.available('facades', district.facades.upper);
  if (!ground.length && !upper.length) return;
  if (!ctx.chance(arch.facadeChance)) return;
  const groundHeight = ground.length ? Math.min(arch.groundFloorHeight, height * 0.4) : 0;
  const bands = [];
  if (ground.length) bands.push({ records: ground, base: 0, size: groundHeight, upper: false });
  if (upper.length) bands.push({ records: upper, base: groundHeight, size: height - groundHeight, upper: true });
  bands.forEach(band => {
    const primary = ctx.pick(band.records);
    const sidesByRecord = new Map();
    ['front', 'back', 'left', 'right'].forEach(side => {
      const record = ctx.chance(arch.facadeMixChance) ? ctx.pick(band.records) : primary;
      if (!sidesByRecord.has(record)) sidesByRecord.set(record, []);
      sidesByRecord.get(record).push(side);
    });
    sidesByRecord.forEach((sides, record) => {
      const [scaleMin, scaleMax] = record.definition.scaleRange ?? [1, 1];
      const scale = Math.round(ctx.range(scaleMin, scaleMax) * 20) / 20;
      const tileSize = [record.tileSize[0] * scale, record.tileSize[1] * scale];
      const size = record.definition.wrap === 'repeat-x' ? Math.min(band.size, tileSize[1]) : band.size;
      const mesh = new THREE.Mesh(kit.assets.facadeGeometry(width, depth, size, tileSize, sides, facadeOffsets(ctx, record, sides, width, depth, tileSize[0])),kit.assets.surfaceMaterial(record));
      mesh.userData.visualLod = 'near';
      mesh.position.y = band.base;
      group.add(mesh);
      if (record.definition.providesWindows) ctx.state.facadeCover = Math.max(ctx.state.facadeCover ?? 0, band.base + size);
    });
  });
}

// Altura até onde a fachada real já traz janelas/letreiros; decoração procedural fica acima dela.
const covered = (ctx, y) => y < (ctx.state.facadeCover ?? 0);

// JANELAS — procedurais e não emissivas; a iluminação da cena fornece a leitura noturna.
function windows(ctx) {
  const { arch, kit, palette, width, height, depth, group } = ctx;
  const rows = Math.max(1, Math.floor(height / 4));
  const cols = Math.max(1, Math.floor(width / 2.35));
  const minLitWindows = Math.min(rows * cols, 2);
  let litCount = 0;
  const positions = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (covered(ctx, 1.8 + row * 3.25 + 0.4)) continue;
      positions.push({ row, col });
    }
  }
  ctx.shuffle(positions);
  positions.forEach(({ row, col }, index) => {
    const forced = litCount < minLitWindows && (positions.length - index) <= (minLitWindows - litCount);
    if (!forced && !ctx.chance(arch.windowChance)) return;
    litCount += 1;
    const material = new THREE.MeshStandardMaterial({ color: 0x334454, roughness: 0.72, metalness: 0.08 });
    material.opacity = 0.26 + Math.random() * 0.48;
    const light = new THREE.Mesh(kit.sharedGeometry.window, material);
    light.userData.visualLod = 'medium';
    light.position.set(-width / 2 + 1.2 + col * 2.25, 1.8 + row * 3.25, -depth / 2 - 0.04);
    light.rotation.y = Math.PI;
    group.add(light);
    kit.windows.push({ mesh: light, base: material.opacity, phase: Math.random() * 9 });
  });
  // Janelas laterais — nos dois lados (esquerdo e direito), não só um. Se nenhuma janela frontal
  // acendeu (fachada cobre tudo), força pelo menos uma janela lateral.
  const forceSideWindow = litCount === 0;
  const sideRows = Math.max(1, Math.floor(height / 5));
  [1, -1].forEach(sideSign => {
    for (let row = 0; row < sideRows; row += 1) {
      const y = 2.2 + row * 4.2;
      const remainingRows = sideRows - row;
      const forced = forceSideWindow && litCount === 0 && sideSign === 1 && remainingRows === 1 && !covered(ctx, y + 0.4);
      if (covered(ctx, y + 0.4) || (!forced && !ctx.chance(arch.sideWindowChance))) continue;
      litCount += 1;
      const material = new THREE.MeshStandardMaterial({ color: 0x334454, roughness: 0.72, metalness: 0.08 });
      material.opacity = 0.24 + Math.random() * 0.32;
      const sideWindow = new THREE.Mesh(kit.sharedGeometry.narrowWindow, material);
      sideWindow.userData.visualLod = 'medium';
      sideWindow.position.set(sideSign * (width / 2 + 0.04), y, depth * 0.12);
      sideWindow.rotation.y = sideSign * Math.PI / 2;
      group.add(sideWindow);
      kit.windows.push({ mesh: sideWindow, base: material.opacity, phase: Math.random() * 9 });
    }
  });
}

// ELEMENTOS ARQUITETÔNICOS — friso vertical, faixas, painéis e marquise.
function accents(ctx) {
  const { arch, kit, palette, width, height, depth, group } = ctx;
  if (!covered(ctx, height * 0.06)) group.add(scaledBox(ctx, kit.assets.basicMaterial(palette.primary, arch.edgeOpacity), [0.08, height * 0.72, 0.08], [width * 0.38, height * 0.42, -depth / 2 - 0.12], 'medium'));
  if (arch.windowBands) {
    const bandMaterial = kit.assets.basicMaterial(palette.primary, 0.18);
    for (let row = 1; row < Math.floor(height / 5); row += 2) {
      if (!covered(ctx, row * 4.1)) group.add(scaledBox(ctx, bandMaterial, [width * 0.8, 0.08, 0.04], [0, row * 4.1, -depth / 2 - 0.07], 'medium'));
    }
  }
  if (covered(ctx, height * 0.56 + Math.max(1, height / 8) * 0.35) || !ctx.chance(arch.panelChance)) return;
  const panel = new THREE.Mesh(kit.sharedGeometry.panel, kit.assets.basicMaterial(palette.primary, arch.panelOpacity));
  panel.userData.visualLod = 'medium';
  panel.scale.set(Math.max(1, width / 4), Math.max(1, height / 8), 1);
  panel.position.set(width * 0.22, height * 0.56, -depth / 2 - 0.09);
  group.add(panel);
  if (arch.canopy && !covered(ctx, height * 0.35)) {
    const canopy = new THREE.Mesh(kit.sharedGeometry.awning, kit.assets.basicMaterial(palette.primary, 0.34));
    canopy.userData.visualLod = 'medium';
    canopy.position.set(-width * 0.12, height * 0.35, -depth / 2 - 0.55);
    group.add(canopy);
  }
}

// ELEMENTOS TÉCNICOS — tubulação, escadas externas e props de parede.
function technical(ctx) {
  const { arch, kit, width, height, depth, group } = ctx;
  if (ctx.chance(arch.externalChance)) {
    for (let i = 0; i < 2; i += 1) {
      const pipe = new THREE.Mesh(kit.sharedGeometry.pipe, kit.materials[arch.pipeMaterial]);
      pipe.userData.visualLod = 'medium';
      pipe.position.set(-width / 2 - 0.22 - i * 0.18, height * 0.42, -depth / 2 - 0.12);
      group.add(pipe);
    }
    const steps = Math.min(6, Math.floor(height / 4));
    for (let step = 0; step < steps; step += 1) {
      const stair = scaledBox(ctx, kit.materials.metal, [width * 0.46, 0.08, 0.7], [width * 0.32, 1.6 + step * 3.2, depth / 2 + 0.38]);
      stair.rotation.z = step % 2 ? -0.06 : 0.06;
      group.add(stair);
    }
  }
  const wallProps = propsFor(ctx, 'wall');
  if (!wallProps.length || !ctx.chance(arch.wallPropChance)) return;
  const record = ctx.pick(wallProps);
  const prop = kit.assets.instantiate(record);
  prop.traverse(object => { if (object.isMesh) object.userData.visualLod = 'near'; });
  prop.position.set(width / 2 + (record.definition.wallOffset ?? 0.1), ctx.range(2, Math.max(2.5, height * 0.8)), ctx.range(-depth * 0.3, depth * 0.3));
  prop.rotation.y = Math.PI / 2;
  group.add(prop);
}

// LETREIRO — textura 'flat' (na fachada) ou 'blade' (perpendicular); fallback = placa luminosa.
function signage(ctx) {
  const { arch, kit, district, palette, width, height, depth, group } = ctx;
  if (covered(ctx, Math.max(2.2, height * 0.44)) || !ctx.chance(arch.signChance)) return;
  const signs = kit.assets.available('signs', district.signs);
  let sign;
  if (signs.length) {
    const record = ctx.pick(signs);
    const [signWidth, signHeight] = record.definition.size ?? [3, 1];
    sign = new THREE.Mesh(kit.assets.unitPlane(), kit.assets.emissiveMaterial(record, district.lighting.signIntensity));
    if (record.definition.mount === 'blade') {
      sign.scale.set(signWidth, signHeight, 1);
      sign.rotation.y = Math.PI / 2;
      sign.position.set(ctx.pick([-1, 1]) * width * 0.35, Math.max(signHeight / 2 + 2, height * 0.5), -depth / 2 - signWidth / 2 - 0.15);
    } else {
      const fit = Math.min(1, (width * 0.8) / signWidth);
      sign.scale.set(signWidth * fit, signHeight * fit, 1);
      sign.rotation.y = Math.PI;
      sign.position.set(-width * 0.18, Math.max(2.2, height * 0.44), -depth / 2 - 0.1);
    }
  } else {
    sign = new THREE.Mesh(kit.assets.unitBox(), kit.assets.basicMaterial(palette.primary, 0.64));
    sign.scale.set(Math.min(3.4, width * 0.7), 0.72, 0.08);
    sign.position.set(-width * 0.18, Math.max(2.2, height * 0.44), -width * 0.52);
  }
  sign.userData.visualLod = signs.length ? 'near' : 'medium';
  group.add(sign);
  kit.facadeLights.push({ mesh: sign, base: sign.material.opacity, phase: Math.random() * 4, glitch: arch.signGlitch });
}

// OUTDOOR — só existe com asset real (sem fallback procedural).
function billboard(ctx) {
  const { arch, kit, district, width, height, depth, group } = ctx;
  const boards = kit.assets.available('billboards', district.billboards);
  if (!boards.length || !ctx.chance(arch.billboardChance)) return;
  const record = ctx.pick(boards);
  const onWall = record.definition.placement === 'wall';
  const [baseWidth, baseHeight] = record.definition.size ?? [6, 3];
  const fit = Math.min(1, ((onWall ? depth : width) * 0.9) / baseWidth);
  const boardWidth = baseWidth * fit;
  const boardHeight = baseHeight * fit;
  const rig = new THREE.Group();
  const panel = new THREE.Mesh(kit.assets.unitPlane(), kit.assets.emissiveMaterial(record, district.lighting.billboardIntensity));
  panel.userData.visualLod = 'near';
  panel.scale.set(boardWidth, boardHeight, 1);
  panel.rotation.y = Math.PI;
  panel.position.z = -0.12;
  rig.add(panel, scaledBox(ctx, kit.materials.metal, [boardWidth + 0.3, boardHeight + 0.3, 0.2], [0, 0, 0]));
  if (onWall) {
    rig.rotation.y = -Math.PI / 2;
    rig.position.set(width / 2 + 0.12, THREE.MathUtils.clamp(height * 0.62, boardHeight / 2 + 2, height - boardHeight / 2 - 0.4), 0);
  } else {
    const legHeight = 0.9;
    [-1, 1].forEach(side => rig.add(scaledBox(ctx, kit.materials.metal, [0.14, legHeight, 0.14], [side * boardWidth * 0.35, -boardHeight / 2 - legHeight / 2, 0])));
    rig.position.set(0, height + 0.16 + legHeight + boardHeight / 2, 0);
  }
  group.add(rig);
  kit.facadeLights.push({ mesh: panel, base: panel.material.opacity, phase: Math.random() * 4, glitch: arch.signGlitch });
}

// COBERTURA — laje, textura de cobertura opcional, máquinas, antena e props de telhado.
// Usa `silhouetteTop` (topo real após massa de escalonado/lâmina/coroa) em vez de `height`, para
// a laje e os elementos técnicos ficarem no topo de verdade, não enterrados na massa extra.
function roof(ctx) {
  const { arch, kit, district, width, height, depth, group } = ctx;
  const top = ctx.state.silhouetteTop ?? height;
  group.add(scaledBox(ctx, kit.materials[arch.roofMaterial], [width + 0.12, 0.16, depth + 0.12], [0, top + 0.08, 0], 'medium'));
  const roofSurfaces = kit.assets.available('facades', district.facades.roof);
  if (roofSurfaces.length) {
    const record = ctx.pick(roofSurfaces);
    const surface = new THREE.Mesh(kit.assets.tiledPlane(width + 0.12, depth + 0.12, record.tileSize), kit.assets.surfaceMaterial(record));
    surface.userData.visualLod = 'near';
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = top + 0.165;
    group.add(surface);
  }
  // Máquinas/HVAC/caixas técnicas — telhado nunca fica vazio (prédios médios/baixos também).
  const unitCount = arch.roofUnits.min + (ctx.chance(arch.roofUnits.extraChance) ? 1 : 0);
  for (let i = 0; i < unitCount; i += 1) {
    const unit = new THREE.Mesh(kit.sharedGeometry.vent, kit.materials.metal);
    unit.userData.visualLod = 'medium';
    unit.position.set(-width * 0.28 + i * 0.8, top + 0.42, -depth * 0.12);
    group.add(unit);
  }
  if (arch.antenna) {
    const antenna = new THREE.Mesh(kit.sharedGeometry.pipe, kit.materials.panel);
    antenna.position.set(width * 0.28, top + 1.8, 0);
    group.add(antenna);
  }
  // Borda fina iluminável no topo — só em prédios altos o bastante para contar no skyline
  // (metade deles, por sorteio). É um PERÍMETRO oco (4 segmentos finos nas bordas), não uma
  // laje cheia — senão vira um retângulo colorido chapado visível de longe no MAP.
  if (height >= TALL_SILHOUETTE_THRESHOLD && ctx.chance(0.5)) {
    const edgeColor = ctx.pick(arch.lightingColors ?? [ctx.palette.primary]);
    // Material compartilhado pelas 4 bordas — pulsam juntas como um único contorno, e só a
    // primeira entra em kit.facadeLights (as outras 3 acompanham de graça via mesmo material).
    const edgeMaterial = kit.assets.neonMaterial(edgeColor, 0.7, false, 1.4).clone();
    const edgeY = top + 0.02;
    const thickness = 0.06;
    const phase = Math.random() * Math.PI * 2;
    [
      [width + 0.1, thickness, 0, depth / 2],
      [width + 0.1, thickness, 0, -depth / 2],
      [thickness, depth + 0.1, width / 2, 0],
      [thickness, depth + 0.1, -width / 2, 0]
    ].forEach(([sx, sz, x, z], index) => {
      const edge = scaledBox(ctx, edgeMaterial, [sx, 0.05, sz], [x, edgeY, z], 'far');
      group.add(edge);
      if (index === 0) kit.facadeLights.push({ mesh: edge, base: 0.7, phase, speed: 0.4, glitch: false, blackoutChance: 0.0004 });
    });
  }
  const roofProps = propsFor(ctx, 'roof');
  if (roofProps.length && ctx.chance(arch.roofPropChance)) {
    const prop = kit.assets.instantiate(ctx.pick(roofProps));
    prop.traverse(object => { if (object.isMesh) object.userData.visualLod = 'near'; });
    prop.position.set(ctx.range(-width * 0.3, width * 0.3), top + 0.16, ctx.range(-depth * 0.3, depth * 0.3));
    prop.rotation.y = Math.floor(ctx.range(0, 4)) * Math.PI / 2;
    group.add(prop);
  }
}

// PROPS DE RUA — instanciados (fora do prédio, não participam da oclusão).
const streetMatrix = new THREE.Matrix4();
function street(ctx) {
  const { arch, kit, width, depth, group } = ctx;
  const streetProps = propsFor(ctx, 'street');
  if (!streetProps.length || !ctx.chance(arch.streetPropChance)) return;
  group.updateMatrix();
  streetMatrix.makeRotationY(Math.floor(ctx.range(0, 4)) * Math.PI / 2)
    .setPosition(ctx.pick([-1, 1]) * (width / 2 + 0.6), 0, -depth / 2 - 0.6);
  kit.batcher.add(ctx.pick(streetProps), group.matrix.clone().multiply(streetMatrix));
}

// ILUMINAÇÃO ARQUITETÔNICA — faixas LED, bordas emissivas e clusters espalhados pelos QUATRO
// lados de cada prédio (front/back/left/right), usando 1-3 cores do perfil do distrito. Só
// materiais emissivos (MeshBasicMaterial, toneMapped:false) e meshes simples reaproveitados do
// cache: nada de PointLight por prédio — a intensidade visual vem da cor crua + halos de glow.
const architecturalPalette = [0x4ee6e4, 0x2f6bff, 0xff4fd8, 0xb36cff, 0xf04f62, 0xe6a85e, 0x8edb79, 0xd8f4ff];

// front/back andam ao longo de X (usam width); left/right andam ao longo de Z (usam depth).
// normal[axis] = deslocamento para fora da face; along = eixo de varredura horizontal do lado.
const SIDES = [
  { id: 'front', axis: 'z', normal: -1, along: 'x', rotY: 0 },
  { id: 'back', axis: 'z', normal: 1, along: 'x', rotY: Math.PI },
  { id: 'right', axis: 'x', normal: 1, along: 'z', rotY: -Math.PI / 2 },
  { id: 'left', axis: 'x', normal: -1, along: 'z', rotY: Math.PI / 2 }
];

function pickLightColors(ctx, count) {
  const source = ctx.arch.lightingColors ?? architecturalPalette;
  const colors = [];
  while (colors.length < count) {
    const candidate = ctx.pick(source);
    if (!colors.includes(candidate)) colors.push(candidate);
  }
  return colors;
}

// Posiciona um elemento relativo a um lado: `across` desliza ao longo do lado (0 = centro),
// `out` é o quanto sai da face (offset positivo = para fora do volume).
function sidePosition(side, width, depth, across, out) {
  const span = side.along === 'x' ? width : depth;
  const along = { x: 0, y: 0, z: 0 };
  along[side.along] = across * span;
  along[side.axis] = side.normal * (((side.axis === 'x' ? width : depth) / 2) + out);
  return [along.x, along.y, along.z];
}

// Faixa/borda neon com halo de glow opcional (plano aditivo discreto, colado à peça, sem custo
// de PointLight). O halo é só um leve reforço de brilho — não pode ficar maior que a peça a
// ponto de parecer um elemento à parte flutuando no ar.
// Retorna { mesh, halo, node } — `node` é o que deve ser adicionado ao grupo do prédio.
function neonStrip(ctx, color, [sx, sy, sz], position, rotY, { glow = false, additive = false, lod = 'medium', intensity = 1 } = {}) {
  const mesh = scaledBox(ctx, ctx.kit.assets.neonMaterial(color, 0.94, additive, intensity).clone(), [sx, sy, sz], position, lod);
  mesh.rotation.y = rotY;
  if (!glow) return { mesh, halo: null, node: mesh };
  const wrapper = new THREE.Group();
  wrapper.add(mesh);
  const halo = new THREE.Mesh(ctx.kit.assets.glowPlane(), ctx.kit.assets.neonMaterial(color, 0.3, true, Math.min(intensity, 1.6)).clone());
  halo.userData.visualLod = lod === 'far' ? 'far' : 'near';
  halo.userData.skipOcclusion = true;
  halo.scale.set(sx * 1.6, Math.max(sy, sz) * 2.2, 1);
  halo.position.set(position[0], position[1], position[2]);
  halo.rotation.y = rotY;
  halo.raycast = () => {};
  wrapper.add(halo);
  return { mesh, halo, node: wrapper };
}

function architecturalLighting(ctx) {
  const { arch, kit, width, height, depth, group } = ctx;
  const colorCount = 1 + Math.floor(Math.random() * (arch.lightColorVariety ?? 2.4));
  const colors = pickLightColors(ctx, Math.min(3, Math.max(1, colorCount)));
  const density = arch.lightDensity ?? 1;
  const register = (mesh, opts = {}) => {
    kit.facadeLights.push({
      mesh, base: mesh.material.opacity, phase: Math.random() * Math.PI * 2,
      speed: opts.speed ?? (0.5 + Math.random() * 1.4),
      glitch: opts.glitch ?? Math.random() < 0.14,
      flickerHeavy: opts.flickerHeavy ?? false,
      blackoutChance: opts.blackoutChance ?? 0.0012,
      linked: opts.linked ?? null
    });
  };
  const place = (color, size, position, rotY, opts) => {
    const { mesh, halo, node } = neonStrip(ctx, color, size, position, rotY, opts);
    group.add(node);
    return { mesh, halo };
  };
  const registerPair = (mesh, halo, opts = {}) => {
    register(mesh, opts);
    if (halo) register(halo, { ...opts, glitch: false, blackoutChance: 0, linked: mesh });
  };

  // Uma faixa principal opcional por prédio mantém a assinatura cyberpunk sem preencher
  // todas as quatro faces com luz.
  if (ctx.chance(Math.min(0.5, 0.22 + density * 0.16))) {
    const side = ctx.pick(SIDES);
    const faceCovered = (side.id === 'front' || side.id === 'back') && covered(ctx, height * 0.5);
    const color = ctx.pick(colors);
    if (!faceCovered) {
      const stripWidth = (side.along === 'x' ? width : depth) * ctx.range(0.3, 0.5);
      const [sx, sz] = side.axis === 'z' ? [stripWidth, 0.07] : [0.07, stripWidth];
      const position = sidePosition(side, width, depth, ctx.range(-0.12, 0.12), 0.045);
      position[1] = height * ctx.range(0.28, 0.55);
      const { mesh, halo } = place(color, [sx, 0.12, sz], position, side.rotY, { glow: true, additive: true, lod: 'far', intensity: 1.7 });
      registerPair(mesh, halo, { speed: 0.7 + Math.random() * 0.6 });
    } else {
      const position = sidePosition(side, width, depth, ctx.pick([-0.42, 0.42]), 0.02);
      position[1] = height * 0.5;
      const { mesh, halo } = place(color, [0.1, height * ctx.range(0.32, 0.5), 0.1], position, side.rotY, { glow: true, additive: true, lod: 'far', intensity: 1.7 });
      registerPair(mesh, halo, { speed: 0.3 + Math.random() * 0.4 });
    }
  }

  // Entrada iluminada — só em UM lado do prédio (o da frente), não nos quatro.
  if (ctx.chance(0.68)) {
    const entranceColor = ctx.pick(colors);
    const front = SIDES[0];
    const entrancePos = sidePosition(front, width, depth, 0, 0.05);
    entrancePos[1] = 1.05;
    const entranceSpan = Math.min(width * 0.5, 2.2);
    const { mesh: entrance } = place(entranceColor, [entranceSpan, 0.14, 0.06], entrancePos, front.rotY, { glow: false });
    register(entrance, { speed: 0.6, glitch: false, blackoutChance: 0.0005 });
  }

  // Camada MÉDIA — só parte dos prédios, e no máximo UM lado extra ganha uma faixa a mais.
  // Controlada por lightDensity (não decide presença, só se existe algo além do mínimo).
  const mediumTier = ctx.chance(Math.min(0.18, (arch.lightDensity ?? 1) * 0.13));
  if (mediumTier) {
    const side = ctx.pick(SIDES);
    const span = side.along === 'x' ? width : depth;
    const y = ctx.range(height * 0.15, height * 0.8);
    const faceCovered = (side.id === 'front' || side.id === 'back') && covered(ctx, y);
    if (!faceCovered) {
      const color = ctx.pick(colors);
      const stripWidth = span * ctx.range(0.25, 0.45);
      const [sx, sz] = side.axis === 'z' ? [stripWidth, 0.06] : [0.06, stripWidth];
      const position = sidePosition(side, width, depth, ctx.range(-0.2, 0.2), 0.04);
      position[1] = y;
      const { mesh, halo } = place(color, [sx, 0.06, sz], position, side.rotY, { glow: true, additive: true });
      registerPair(mesh, halo, { speed: 0.8 + Math.random() * 0.6 });
    }
  }

  // Camada FORTE — rara: um único cluster pequeno em um lado do prédio. Sem beacon no topo
  // (elemento flutuando acima do volume, fora da geometria real).
  const strongTier = ctx.chance((arch.architecturalLightChance ?? 0.4) * 0.1);
  if (strongTier) {
    const side = ctx.pick(SIDES);
    const y = ctx.range(2, Math.max(3, height - 2));
    const faceCovered = (side.id === 'front' || side.id === 'back') && covered(ctx, y);
    if (!faceCovered) {
      const color = ctx.pick(colors);
      const span = side.along === 'x' ? width : depth;
      const clusterSize = ctx.range(0.4, 0.9);
      const [sx, sz] = side.axis === 'z' ? [clusterSize, 0.05] : [0.05, clusterSize];
      const position = sidePosition(side, width, depth, ctx.range(-0.35, 0.35), 0.04);
      position[1] = y;
      const { mesh, halo } = place(color, [sx, ctx.range(0.3, 0.6), sz], position, side.rotY, { glow: true, additive: true, lod: 'near', intensity: 1.8 });
      registerPair(mesh, halo, { flickerHeavy: Math.random() < 0.25, blackoutChance: 0.002, speed: 1 + Math.random() * 1.8 });
    }
  }
}

export const BUILDING_MODULES = { structure, facade, windows, accents, technical, signage, billboard, roof, street, architecturalLighting };
