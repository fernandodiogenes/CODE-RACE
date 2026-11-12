import * as THREE from 'three';
import { loadSharedModel } from './shared-model-cache.js';

const COLOR_SLOTS = new Set(['map', 'emissiveMap']);
const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'];
const DEFAULT_WRAP = { facades: 'repeat', signs: 'clamp', billboards: 'clamp' };

// Cada lado é descrito como visto de fora: canto inferior esquerdo, vetor "direita" e normal.
const FACADE_SIDES = {
  front: (w, d, o) => ({ start: [w / 2, 0, -d / 2 - o], right: [-1, 0, 0], normal: [0, 0, -1], length: w }),
  back: (w, d, o) => ({ start: [-w / 2, 0, d / 2 + o], right: [1, 0, 0], normal: [0, 0, 1], length: w }),
  right: (w, d, o) => ({ start: [w / 2 + o, 0, d / 2], right: [0, 0, -1], normal: [1, 0, 0], length: d }),
  left: (w, d, o) => ({ start: [-w / 2 - o, 0, -d / 2], right: [0, 0, 1], normal: [-1, 0, 0], length: d })
};

export class AssetLibrary {
  constructor({ renderer, manifest, baseUrl, onProgress }) {
    this.manifest = manifest;
    this.baseUrl = baseUrl;
    this.maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.manager = new THREE.LoadingManager();
    this.manager.onProgress = (url, loaded, total) => onProgress?.(loaded, total, url);
    this.textureLoader = new THREE.TextureLoader(this.manager);
    this.images = new Map();     // url -> Promise<Texture|null> (uma requisição por arquivo)
    this.textures = new Map();   // url|colorSpace|wrap -> Promise<Texture|null>
    this.models = new Map();     // url -> Promise<Object3D|null>
    this.materials = new Map();  // chave -> Material compartilhado
    this.geometries = new Map(); // chave -> BufferGeometry compartilhada
    this.records = new Map();    // categoria:id -> asset pronto para uso
    this.missing = new Set();
  }

  async preload(refs) {
    const unique = new Map(refs.map(ref => [`${ref.category}:${ref.id}`, ref]));
    await Promise.all([...unique.values()].map(ref => this.prepare(ref.category, ref.id)));
    if (this.missing.size) console.warn(`[neon-city] ${this.missing.size} asset(s) ausente(s), usando fallback procedural:`, [...this.missing]);
    return this;
  }

  async prepare(category, id) {
    const definition = this.manifest[category]?.[id];
    if (!definition) {
      this.missing.add(`${category}:${id} (não registrado no manifest)`);
      return null;
    }
    const record = { category, id, definition, textures: {}, model: null };
    if (definition.textures) {
      const wrap = definition.wrap ?? DEFAULT_WRAP[category] ?? 'repeat';
      const slots = TEXTURE_SLOTS.filter(slot => definition.textures[slot]);
      const loaded = await Promise.all(slots.map(slot => this.texture(definition.textures[slot], slot, wrap, definition.crop)));
      slots.forEach((slot, index) => { if (loaded[index]) record.textures[slot] = loaded[index]; });
      const reference = record.textures.map ?? record.textures.emissiveMap;
      if (!reference) return null;
      // Proporção real da imagem (após recorte): tileHeight em metros define a largura, sem deformar.
      record.aspect = reference.image.width / reference.image.height;
      record.tileSize = definition.tileSize ?? [definition.tileHeight * record.aspect, definition.tileHeight];
    }
    if (definition.model) {
      record.model = await this.model(definition.model);
      if (!record.model) return null;
    }
    this.records.set(`${category}:${id}`, record);
    return record;
  }

  get(category, id) {
    return this.records.get(`${category}:${id}`) ?? null;
  }

  available(category, ids = []) {
    return ids.map(id => this.get(category, id)).filter(Boolean);
  }

  resolve(path) {
    return new URL(path, this.baseUrl).href;
  }

  image(url) {
    if (!this.images.has(url)) {
      this.images.set(url, new Promise(resolve => {
        this.textureLoader.load(url, resolve, undefined, () => {
          this.missing.add(url);
          resolve(null);
        });
      }));
    }
    return this.images.get(url);
  }

  // Variações (color space / wrap) compartilham a mesma Source: um download e um upload por imagem.
  // `crop` ([x, y, largura, altura] em pixels) recorta em memória a região útil do arquivo original.
  texture(path, slot, wrap, crop) {
    const url = this.resolve(path);
    const colorSpace = COLOR_SLOTS.has(slot) ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    const key = `${url}|${colorSpace}|${wrap}|${crop ?? ''}`;
    if (!this.textures.has(key)) {
      this.textures.set(key, this.image(url).then(base => {
        if (!base) return null;
        const texture = crop ? new THREE.Texture(this.cropImage(url, base.image, crop)) : base.clone();
        texture.colorSpace = colorSpace;
        texture.wrapS = wrap === 'clamp' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
        texture.wrapT = wrap === 'repeat' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        texture.anisotropy = this.maxAnisotropy;
        texture.needsUpdate = true;
        return texture;
      }));
    }
    return this.textures.get(key);
  }

  cropImage(url, image, [x, y, width, height]) {
    const key = `${url}|${x},${y},${width},${height}`;
    this.crops ??= new Map();
    if (!this.crops.has(key)) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(image, x, y, width, height, 0, 0, width, height);
      this.crops.set(key, canvas);
    }
    return this.crops.get(key);
  }

  model(path) {
    const url = this.resolve(path);
    if (!this.models.has(url)) {
      this.models.set(url, loadSharedModel(url, this.manager).catch(() => {
        this.missing.add(url);
        return null;
      }));
    }
    return this.models.get(url);
  }

  instantiate(record) {
    const object = record.model.clone(true);
    object.scale.multiplyScalar(record.definition.scale ?? 1);
    return object;
  }

  material(key, create) {
    if (!this.materials.has(key)) this.materials.set(key, create());
    return this.materials.get(key);
  }

  geometry(key, create) {
    if (!this.geometries.has(key)) this.geometries.set(key, create());
    return this.geometries.get(key);
  }

  basicMaterial(color, opacity = 1) {
    return this.material(`basic:${color}:${opacity}`, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity }));
  }

  // Material neon "cru" — ignora o tone mapping ACES da cena (que apaga cores saturadas) e
  // permite blending aditivo para o núcleo de faixas LED/letreiros mais fortes. `intensity` > 1
  // empurra o valor da cor acima de 1.0 (HDR), que é o que o UnrealBloomPass usa como critério
  // de threshold — só assim o elemento "estoura" e produz bloom; opacity sozinho não basta.
  neonMaterial(color, opacity = 1, additive = false, intensity = 1) {
    return this.material(`neon:${color}:${opacity}:${additive}:${intensity}`, () => new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity), transparent: true, opacity, depthWrite: false, toneMapped: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    }));
  }

  // Plano quad maior e semitransparente atrás de um elemento neon, para simular glow sem post-processing.
  glowPlane() {
    return this.geometry('glow-plane', () => new THREE.PlaneGeometry(1, 1));
  }

  // Material PBR para fachadas/coberturas texturizadas.
  surfaceMaterial(record) {
    return this.material(`surface:${record.category}:${record.id}`, () => {
      const { definition, textures } = record;
      return new THREE.MeshStandardMaterial({
        color: definition.tint ?? (textures.map ? 0xffffff : 0x1a2433),
        map: textures.map ?? null,
        normalMap: textures.normalMap ?? null,
        roughnessMap: textures.roughnessMap ?? null,
        metalnessMap: textures.metalnessMap ?? null,
        aoMap: textures.aoMap ?? null,
        alphaMap: textures.alphaMap ?? null,
        transparent: Boolean(textures.alphaMap),
        emissiveMap: textures.emissiveMap ?? null,
        emissive: textures.emissiveMap ? definition.emissive ?? 0xffffff : 0x000000,
        emissiveIntensity: definition.emissiveIntensity ?? 1,
        roughness: definition.roughness ?? 0.85,
        metalness: definition.metalness ?? 0.2
      });
    });
  }

  // Material auto-iluminado para letreiros e outdoors.
  emissiveMaterial(record, intensity = 1) {
    return this.material(`emissive:${record.category}:${record.id}:${intensity}`, () => {
      const { definition, textures } = record;
      return new THREE.MeshBasicMaterial({
        map: textures.emissiveMap ?? textures.map,
        alphaMap: textures.alphaMap ?? null,
        color: new THREE.Color(definition.tint ?? 0xffffff).multiplyScalar(intensity),
        transparent: true,
        opacity: definition.opacity ?? 1,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: definition.blending === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
        toneMapped: false
      });
    });
  }

  unitBox() {
    return this.geometry('unit-box', () => new THREE.BoxGeometry(1, 1, 1));
  }

  unitPlane() {
    return this.geometry('unit-plane', () => new THREE.PlaneGeometry(1, 1));
  }

  // Plano com UV em escala de mundo (1 repetição = tileSize metros).
  tiledPlane(width, height, [tileWidth, tileHeight] = [4, 4]) {
    return this.geometry(`tiled-plane:${width}:${height}:${tileWidth}:${tileHeight}`, () => {
      const geometry = new THREE.PlaneGeometry(width, height);
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * width / tileWidth, uv.getY(i) * height / tileHeight);
      return geometry;
    });
  }

  // Casca aberta com os lados escolhidos (front/back/left/right), base em y = 0 e UV em escala de mundo.
  // Todos os lados que usam a mesma fachada viram um único draw call.
  // uOffsets[lado] desloca a textura horizontalmente (em repetições) para variar o trecho visível.
  facadeGeometry(width, depth, height, [tileWidth, tileHeight] = [4, 4], sides, uOffsets = {}, offset = 0.02) {
    const sideList = [...sides].sort();
    const key = `facade:${width}:${depth}:${height}:${tileWidth}:${tileHeight}:${sideList.map(side => `${side}${uOffsets[side] ?? 0}`).join(',')}`;
    return this.geometry(key, () => {
      const positions = [];
      const normals = [];
      const uvs = [];
      const indices = [];
      sideList.forEach(name => {
        const { start, right, normal, length } = FACADE_SIDES[name](width, depth, offset);
        const base = positions.length / 3;
        const u = length / tileWidth;
        const v = height / tileHeight;
        const u0 = uOffsets[name] ?? 0;
        [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([along, up]) => {
          positions.push(start[0] + right[0] * length * along, height * up, start[2] + right[2] * length * along);
          normals.push(...normal);
          uvs.push(u0 + u * along, v * up);
        });
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeBoundingSphere();
      return geometry;
    });
  }
}
