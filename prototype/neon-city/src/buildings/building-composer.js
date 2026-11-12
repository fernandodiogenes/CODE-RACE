import * as THREE from 'three';
import { BUILDING_MODULES } from './building-modules.js';
import { InstanceBatcher } from '../assets/instance-batcher.js';

// Dimensões em passos de 0.25 m aumentam o reuso de geometrias de fachada no cache.
const quantize = value => Math.round(value * 4) / 4;

export function createBuildingComposer({ assets, materials, sharedGeometry, windows, facadeLights }) {
  const kit = { assets, materials, sharedGeometry, windows, facadeLights, batcher: new InstanceBatcher() };
  const range = (min, max) => min + Math.random() * (max - min);
  const chance = probability => Math.random() < probability;
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const shuffle = list => {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  return {
    compose(district, x, z) {
      const arch = district.architecture;
      const width = quantize(range(...arch.footprint));
      const depth = quantize(range(...arch.footprint));
      const height = quantize(range(...arch.heightRange) * (chance(arch.tallChance) ? arch.tallMultiplier : 1));
      const group = new THREE.Group();
      group.position.set(x + range(-arch.jitter, arch.jitter), 0, z + range(-arch.jitter, arch.jitter));
      const rotationStep = arch.rotationJitter ?? 0.025;
      group.rotation.y = Math.round(range(-2, 2)) * rotationStep;
      group.userData.district = district.id;
      group.userData.builtHeight = height;
      const ctx = { group, width, depth, height, district, arch, palette: district.palette, kit, range, chance, pick, shuffle, state: {} };
      arch.modules.forEach(name => BUILDING_MODULES[name]?.(ctx));
      return group;
    },
    // Materializa os InstancedMesh acumulados (props de rua).
    flush(parent) {
      kit.batcher.build(parent);
    }
  };
}
