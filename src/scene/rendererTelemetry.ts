import * as THREE from "three";

export type RendererCapabilityTelemetry = {
  threeRevision: string;
  rendererPath: string;
  webgl2: boolean;
  webgpu: boolean;
};

export const detectRendererCapabilities = (
  renderer: THREE.WebGLRenderer,
): RendererCapabilityTelemetry => {
  const webgl2 = Boolean(renderer.capabilities.isWebGL2);
  const webgpu = Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
  return {
    threeRevision: THREE.REVISION,
    rendererPath: `WebGLRenderer/${webgl2 ? "WebGL2" : "WebGL1"}`,
    webgl2,
    webgpu,
  };
};
