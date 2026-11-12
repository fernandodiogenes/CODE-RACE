import * as THREE from 'three';

// Agrupa cópias repetidas de um mesmo modelo em InstancedMesh (1 draw call por sub-mesh).
// Usado só para elementos que NÃO participam da oclusão (ex.: props de rua):
// o sistema de oclusão precisa de materiais por prédio, o que impede instancing.
export class InstanceBatcher {
  constructor() {
    this.batches = new Map();
    this.scaleMatrix = new THREE.Matrix4();
  }

  add(record, placement) {
    const root = record.model;
    root.updateMatrixWorld(true);
    const rootInverse = root.matrixWorld.clone().invert();
    const scale = record.definition.scale ?? 1;
    this.scaleMatrix.makeScale(scale, scale, scale);
    root.traverse(object => {
      if (!object.isMesh) return;
      if (!this.batches.has(object.uuid)) this.batches.set(object.uuid, { geometry: object.geometry, material: object.material, matrices: [] });
      const matrix = placement.clone().multiply(this.scaleMatrix).multiply(rootInverse).multiply(object.matrixWorld);
      this.batches.get(object.uuid).matrices.push(matrix);
    });
  }

  build(parent) {
    this.batches.forEach(({ geometry, material, matrices }) => {
      const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      parent.add(mesh);
    });
    this.batches.clear();
  }
}
