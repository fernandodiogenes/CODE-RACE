const modelPromises = new Map();
let loaderModulePromise;

export function loadSharedModel(url, manager) {
  if (!modelPromises.has(url)) {
    const modelPromise = (loaderModulePromise ??= import('three/addons/loaders/GLTFLoader.js'))
      .then(({ GLTFLoader }) => new Promise((resolve, reject) => {
        new GLTFLoader(manager).load(url, gltf => resolve(gltf.scene), undefined, reject);
      }));
    modelPromises.set(url, modelPromise);
    modelPromise.catch(() => {
      if (modelPromises.get(url) === modelPromise) modelPromises.delete(url);
    });
  }
  return modelPromises.get(url);
}
