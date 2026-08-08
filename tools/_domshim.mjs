/**
 * Minimal DOM shim so three's loaders parse in plain Node.
 *
 * three's GLTFLoader/FBXLoader reach for `document.createElementNS` to build image elements even
 * when a file embeds no textures, and for `self`/`window` in a few feature checks. None of the
 * geometry, skeleton or animation paths touch the DOM, so stubbing these is enough to run a loader
 * offline — which is what makes asset analysis cost a second instead of a browser boot and a slot
 * on the capture lock.
 */
class FakeImg {
  constructor() { this.width = 1; this.height = 1; }
  addEventListener() {} removeEventListener() {}
  set src(_v) {} get src() { return ''; }
}
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElementNS: () => new FakeImg(),
    createElement: (t) => (t === 'canvas'
      ? {
        width: 1,
        height: 1,
        getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }),
      }
      : new FakeImg()),
  };
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (typeof globalThis.self === 'undefined') globalThis.self = globalThis;
if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:stub';
if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = () => {};
