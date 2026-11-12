// Configuração central dos distritos.
// Listas de assets (facades/signs/billboards/props) referenciam ids de assets/manifest.js.
// Listas vazias = o prédio usa apenas os módulos procedurais de fallback.

const baseArchitecture = {
  modules: ['structure', 'facade', 'windows', 'technical', 'architecturalLighting', 'roof', 'street'],
  footprint: [6.4, 10.8],
  jitter: 1.2,
  heightRange: [7, 25],
  tallChance: 0,
  tallMultiplier: 1.55,
  shellMaterials: ['concrete', 'metal', 'glass', 'rust'],
  sideMassChance: 0.44,
  groundFloorHeight: 3.2,
  facadeChance: 1,
  facadeMixChance: 0.25,
  windowChance: 0.22,
  sideWindowChance: 0.58,
  edgeOpacity: 0.2,
  windowBands: false,
  panelChance: 0.84,
  panelOpacity: 0.16,
  canopy: false,
  externalChance: 0.58,
  pipeMaterial: 'metal',
  signChance: 0.46,
  signGlitch: false,
  billboardChance: 0.35,
  roofMaterial: 'roof',
  roofUnits: { min: 1, extraChance: 0.55 },
  antenna: false,
  roofPropChance: 0.4,
  wallPropChance: 0.3,
  streetPropChance: 0.3
};

const baseLighting = {
  // > 1 empurra a cor do material acima de 1.0 (HDR) — é o que faz o UnrealBloomPass reconhecer
  // o elemento como fonte forte e estourar em bloom. Outdoors/letreiros são os "leitores" do
  // skyline, por isso ficam mais intensos que o mínimo arquitetônico.
  signIntensity: 1.8,
  billboardIntensity: 2.4,
  // { color, intensity, distance, decay, position: [x, y, z] } — luzes extras do distrito
  pointLights: []
};

const emptyAssets = () => ({
  facades: { ground: [], upper: [], roof: [] },
  signs: [],
  billboards: [],
  props: []
});

export const DISTRICTS = [
  {
    id: 'district-zero',
    name: 'DISTRICT ZERO',
    palette: { primary: 0x4ee6e4, atmosphere: 0x0d2531, windows: [0x4ee6e4, 0xe6a85e, 0x4ee6e4], sideWindow: 0x4ee6e4 },
    lighting: { ...baseLighting, pointLights: [{ color: 0x4ee6e4, intensity: 6, distance: 26, decay: 2.2, position: [-48, 5, 0] }] },
    ...emptyAssets(),
    architecture: {
      ...baseArchitecture,
      // Poucas torres altas por aqui — quando aparecem, escalonado simples (silhueta discreta,
      // sem lâminas/coroas chamativas, coerente com o perfil "frio/discreto" do distrito).
      silhouettes: ['stepped'],
      lightingColors: [0x4ee6e4, 0xd8f4ff, 0x2f6bff],
      lightDensity: 0.55,
      lightColorVariety: 1.6,
      architecturalLightChance: 0.3
    }
  },
  {
    id: 'cyber-alley',
    name: 'CYBER ALLEY',
    palette: { primary: 0xb36cff, atmosphere: 0x20143a, windows: [0xb36cff, 0x4ee6e4], sideWindow: 0xb36cff },
    lighting: { ...baseLighting, pointLights: [{ color: 0xb36cff, intensity: 8, distance: 30, decay: 2.2, position: [-24, 6, -10] }] },
    ...emptyAssets(),
    architecture: {
      ...baseArchitecture,
      canopy: true,
      // Verticalidade forte: lâminas dominam, escalonado como variação ocasional.
      silhouettes: ['blade', 'blade', 'stepped'],
      lightingColors: [0x4ee6e4, 0xff4fd8, 0xb36cff],
      lightDensity: 1.05,
      lightColorVariety: 2.2,
      architecturalLightChance: 1
    }
  },
  {
    id: 'black-market',
    name: 'BLACK MARKET',
    palette: { primary: 0xe6a85e, atmosphere: 0x312012, windows: [0xe6a85e, 0xf04f62, 0x8edb79], sideWindow: 0xe6a85e },
    lighting: { ...baseLighting, pointLights: [{ color: 0xf04f62, intensity: 7, distance: 26, decay: 2.2, position: [4, 6, 33] }] },
    ...emptyAssets(),
    architecture: {
      ...baseArchitecture,
      windowBands: true,
      canopy: true,
      pipeMaterial: 'rust',
      signGlitch: true,
      roofMaterial: 'rust',
      roofUnits: { min: 3, extraChance: 0 },
      // Composição irregular/improvisada: rotação bem maior que o resto da cidade (±3-8°, contra
      // ±0-3° padrão), reforça a leitura "sem planejamento urbano" pedida na direção de arte.
      rotationJitter: 0.07,
      // Sem torres monumentais aqui — se algum prédio raro rolar alto, só escalonado tosco.
      silhouettes: ['stepped'],
      lightingColors: [0xf04f62, 0xe6a85e, 0xff4fd8, 0x8edb79],
      lightDensity: 0.95,
      lightColorVariety: 2.6,
      architecturalLightChance: 1
    }
  },
  {
    id: 'neon-district',
    name: 'NEON DISTRICT',
    palette: { primary: 0xff4fa3, atmosphere: 0x32132a, windows: [0x4ee6e4, 0xe6a85e, 0x4ee6e4], sideWindow: 0x4ee6e4 },
    lighting: { ...baseLighting, pointLights: [{ color: 0xff4fd8, intensity: 9, distance: 30, decay: 2.2, position: [24, 6, 10] }] },
    ...emptyAssets(),
    architecture: {
      ...baseArchitecture,
      tallChance: 0.42,
      windowChance: 0.34,
      edgeOpacity: 0.4,
      windowBands: true,
      panelOpacity: 0.26,
      antenna: true,
      // Mistura equilibrada de silhuetas — é o distrito mais visualmente sofisticado/variado.
      silhouettes: ['stepped', 'blade', 'crown'],
      lightingColors: [0x4ee6e4, 0xff4fd8, 0xb36cff],
      lightDensity: 1.1,
      lightColorVariety: 2.4,
      architecturalLightChance: 1
    }
  },
  {
    id: 'central-nexus',
    name: 'CENTRAL NEXUS',
    palette: { primary: 0xbdeff2, atmosphere: 0x1d3442, windows: [0x4ee6e4, 0xe6a85e, 0x4ee6e4], sideWindow: 0x4ee6e4 },
    lighting: { ...baseLighting, pointLights: [{ color: 0xbdeff2, intensity: 10, distance: 34, decay: 2.2, position: [47, 10, 8] }] },
    ...emptyAssets(),
    architecture: {
      ...baseArchitecture,
      tallChance: 0.42,
      windowBands: true,
      antenna: true,
      // Composição monumental: coroas em balanço dominam, reforçando a leitura corporativa/cheia.
      silhouettes: ['crown', 'crown', 'stepped'],
      lightingColors: [0xbdeff2, 0xd8f4ff, 0x4ee6e4],
      lightDensity: 1,
      lightColorVariety: 1.4,
      architecturalLightChance: 0.55
    }
  }
];

// Assets que não pertencem a um distrito específico.
export const CITY_ASSETS = {
  vehicles: []
};

export function districtIndexAt(x) {
  return Math.min(DISTRICTS.length - 1, Math.max(0, Math.floor((x + 60) / 24)));
}

// Tudo que precisa ser pré-carregado antes de montar a cidade.
export function collectAssetRefs() {
  const refs = [];
  const push = (category, ids) => ids.forEach(id => refs.push({ category, id }));
  DISTRICTS.forEach(district => {
    push('facades', [...district.facades.ground, ...district.facades.upper, ...district.facades.roof]);
    push('signs', district.signs);
    push('billboards', district.billboards);
    push('props', district.props);
  });
  push('vehicles', CITY_ASSETS.vehicles);
  push('characters', [
    'bubbleguy', 'cauboi', 'littlegirl', 'mulherpunk', 'robot',
    'billy', 'cage', 'jaden', 'spencer'
  ]);
  return refs;
}
