// Registro central de assets visuais do Neon City.
// Caminhos são relativos a `prototype/neon-city/assets/`.
// Um asset só é carregado se algum distrito (src/districts/district-config.js) o referenciar.
// Entradas cujo arquivo não existir são ignoradas e o prédio usa o módulo procedural de fallback.
//
// FACADES (texturas tileáveis aplicadas por faixa: ground / upper / roof)
//   'dz-concrete-panels': {
//     textures: {
//       map: 'facades/dz-concrete-panels/albedo.jpg',
//       normalMap: 'facades/dz-concrete-panels/normal.jpg',
//       roughnessMap: 'facades/dz-concrete-panels/roughness.jpg',
//       emissiveMap: 'facades/dz-concrete-panels/emissive.jpg'
//     },
//     tileSize: [4, 3.25],        // metros cobertos por 1 repetição da textura (largura, altura)
//     roughness: 0.9, metalness: 0.15,
//     emissive: 0xffffff, emissiveIntensity: 1.2,
//     providesWindows: true      // desliga as janelas procedurais quando usada na faixa upper
//   }
//
// SIGNS (letreiros; PNG com alpha, montados 'flat' na fachada ou 'blade' perpendicular)
//   'ca-ramen-kanji': { textures: { map: 'signs/ca-ramen-kanji.png' }, size: [1.2, 3.6], mount: 'blade', blending: 'additive' }
//
// BILLBOARDS (outdoors; 'roof' sobre a cobertura ou 'wall' na lateral +X)
//   'nd-synth-ad-01': { textures: { map: 'billboards/nd-synth-ad-01.jpg' }, size: [7, 3.5], placement: 'roof' }
//
// PROPS (modelos glTF/GLB; placement 'roof' | 'wall' | 'street'. Frente do modelo = +Z, 1 unidade = 1 m)
//   'ac-unit-01': { model: 'props/ac-unit-01.glb', placement: 'roof', scale: 1 }
//   'bm-crate-stack': { model: 'districts/black-market/crate-stack.glb', placement: 'street' }
//
// VEHICLES (modelos glTF/GLB; frente = +Z)
//   'hover-taxi': { model: 'vehicles/hover-taxi.glb', scale: 0.9 }

export const ASSET_MANIFEST = {
  characters: {
    bubbleguy: { model: 'characters/3d/bubbleguy.glb', scale: 0.9 },
    cauboi: { model: 'characters/3d/cauboi.glb', scale: 0.9 },
    littlegirl: { model: 'characters/3d/LittleGirl.glb', scale: 0.9 },
    mulherpunk: { model: 'characters/3d/mulherpunk.glb', scale: 0.9 },
    robot: { model: 'characters/3d/Robot.glb', scale: 0.9 },
    billy: { model: 'characters/3d/billy.glb', scale: 0.9 },
    cage: { model: 'characters/3d/cage.glb', scale: 0.9 },
    jaden: { model: 'characters/3d/jaden.glb', scale: 0.9 },
    spencer: { model: 'characters/3d/spencer.glb', scale: 0.9 }
  },
  facades: {},
  signs: {},
  billboards: {},
  props: {},
  vehicles: {}
};
