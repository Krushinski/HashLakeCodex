import * as THREE from "three";
import type { WeatherSnapshot } from "../state/weatherEngine";
import { getWeatherPalette } from "./artDirection";
import { GLSL_NOISE, makeNoise2D, makeRng } from "./scenicUtils";

export type RendererCapabilityTelemetry = {
  threeRevision: string;
  rendererPath: string;
  webgl2: boolean;
  webgpu: boolean;
};

export type ScenicExperimentalStats = RendererCapabilityTelemetry & {
  requested: boolean;
  active: boolean;
  reason: string;
  mountainVertices: number;
  forestInstances: number;
  fogLayers: number;
};

export type ScenicExperimentalGate = {
  requested: boolean;
  eligible: boolean;
  active: boolean;
  reason: string;
};

export type RealismSpikeSystem = {
  group: THREE.Group;
  update: (
    weather: WeatherSnapshot,
    camera: THREE.PerspectiveCamera,
    elapsed: number,
  ) => void;
  setGate: (gate: ScenicExperimentalGate) => void;
  getStats: () => ScenicExperimentalStats;
};

const angleDiff = (a: number, b: number) => {
  let delta = a - b;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
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

export const isScenicExperimentalRequested = () => {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("scenicExperimental") === "1") {
      return true;
    }
    if (params.get("scenicExperimental") === "0") {
      return false;
    }
    return window.localStorage.getItem("hashlake.scenicExperimental.v1") === "1";
  } catch {
    return false;
  }
};

const buildAlpineBackdropGeometry = () => {
  const noise = makeNoise2D(65185);
  const thetaSegments = 176;
  const radialSegments = 16;
  const rInner = 1180;
  const rOuter = 2240;
  const peakMax = 560;
  const vertices: number[] = [];
  const elevs: number[] = [];
  const indices: number[] = [];
  const heroTheta = -Math.PI / 2;

  for (let thetaIndex = 0; thetaIndex <= thetaSegments; thetaIndex += 1) {
    const theta = (thetaIndex / thetaSegments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const warpX = noise.fbm(cos * 1.8 + 14.2, sin * 1.8 - 2.8, 4) * 0.72;
    const warpZ = noise.fbm(cos * 1.8 - 9.1, sin * 1.8 + 18.4, 4) * 0.72;
    let ridge =
      0.46 +
      noise.fbm(cos * 3.2 + warpX * 1.8, sin * 3.2 + warpZ * 1.8, 5) * 0.86;
    ridge = Math.pow(THREE.MathUtils.clamp(ridge, 0, 1.25), 1.74);

    const centerPeak = Math.exp(-(angleDiff(theta, heroTheta - 0.06) ** 2) / (0.33 * 0.33));
    const leftPeak = Math.exp(-(angleDiff(theta, heroTheta - 0.66) ** 2) / (0.28 * 0.28));
    const rightPeak = Math.exp(-(angleDiff(theta, heroTheta + 0.82) ** 2) / (0.34 * 0.34));
    const distantShoulder = Math.exp(-(angleDiff(theta, heroTheta + 2.0) ** 2) / (0.48 * 0.48));
    ridge += centerPeak * 0.42 + leftPeak * 0.24 + rightPeak * 0.28 + distantShoulder * 0.16;
    ridge += Math.max(0, Math.sin(theta * 17.0 + 2.4)) * noise.fbm(cos * 9.2 + 4, sin * 9.2 - 7, 3) * 0.11;
    ridge = THREE.MathUtils.clamp(ridge, 0.15, 1.42);

    const peakHeight = 120 + ridge * 340;
    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const radial = radialIndex / radialSegments;
      const radius = rInner + (rOuter - rInner) * radial;
      const riseIn = Math.sin(Math.min(radial / 0.76, 1) * Math.PI * 0.5);
      const falloff = radial < 0.78 ? 1 : 1 - (radial - 0.78) / 0.3;
      const shoulder = Math.pow(Math.max(0, riseIn), 1.12) * Math.max(0, falloff);
      const eroded =
        noise.fbm(cos * radius * 0.0045 + 32, sin * radius * 0.0045 - 15, 5) *
        peakHeight *
        0.26 *
        shoulder;
      const ravines =
        Math.abs(noise.fbm(cos * radius * 0.009 + 2, sin * radius * 0.009 + 9, 4)) *
        peakHeight *
        0.12 *
        (1 - radial) *
        shoulder;
      const y = Math.max(0, peakHeight * shoulder + eroded - ravines);
      vertices.push(cos * radius, y, sin * radius);
      elevs.push(THREE.MathUtils.clamp(y / peakMax, 0, 1));
    }
  }

  const columns = radialSegments + 1;
  for (let thetaIndex = 0; thetaIndex < thetaSegments; thetaIndex += 1) {
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const a = thetaIndex * columns + radialIndex;
      const b = a + columns;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("elev", new THREE.Float32BufferAttribute(elevs, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createAlpineBackdropMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: new THREE.Vector3(-0.38, 0.72, -0.48).normalize() },
      uSunColor: { value: new THREE.Color(0xffdfa8) },
      uAmbient: { value: new THREE.Color(0xc8e9f4) },
      uFogColor: { value: new THREE.Color(0xd9e9e5) },
      uCamera: { value: new THREE.Vector3() },
      uDark: { value: 0 },
      uFire: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vElev;
      attribute float elev;

      void main() {
        vElev = elev;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vElev;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uAmbient;
      uniform vec3 uFogColor;
      uniform vec3 uCamera;
      uniform float uDark;
      uniform float uFire;
      ${GLSL_NOISE}

      void main() {
        vec3 normal = normalize(vNormal);
        float slope = clamp(normal.y, 0.0, 1.0);
        float rough = bl_fbm(vWorldPos.xz * 0.010 + vec2(21.0, -4.0));
        float broad = bl_fbm(vWorldPos.xz * 0.0024 + 13.0);
        float ravine = bl_fbm(vec2(vWorldPos.x * 0.015 + vWorldPos.y * 0.012, vWorldPos.z * 0.014));

        vec3 grass = vec3(0.105, 0.180, 0.104) * (0.78 + broad * 0.42);
        vec3 darkForest = vec3(0.035, 0.086, 0.054) * (0.86 + broad * 0.38);
        vec3 rock = mix(vec3(0.55, 0.56, 0.52), vec3(0.25, 0.31, 0.31), rough);
        rock = mix(rock, rock * vec3(1.22, 1.16, 1.00), ravine * (1.0 - slope) * 0.22);
        vec3 snow = vec3(0.82, 0.83, 0.77);

        float forestBand = smoothstep(0.22, 0.045, vElev) * smoothstep(0.22, 0.68, slope);
        float grassBand = smoothstep(0.45, 0.12, vElev) * smoothstep(0.18, 0.78, slope);
        float snowBand = smoothstep(0.70, 0.95, vElev + rough * 0.08) * smoothstep(0.18, 0.58, slope);
        vec3 albedo = mix(rock, grass, grassBand * 0.36);
        albedo = mix(albedo, darkForest, forestBand * 0.58);
        albedo = mix(albedo, snow, snowBand * 0.34);

        float diffuse = max(dot(normal, uSunDir), 0.0);
        float sideLight = smoothstep(-0.45, 0.80, dot(normalize(vec3(normal.x, 0.0, normal.z) + 0.001), normalize(vec3(-0.72, 0.0, -0.46))));
        vec3 color = albedo * (uSunColor * diffuse * 1.18 + uAmbient * (0.36 + slope * 0.48));
        color *= 0.78 + sideLight * 0.38;
        color *= 0.78 + smoothstep(0.05, 0.62, vElev) * 0.24;
        color += albedo * vec3(0.95, 0.23, 0.08) * uFire * 0.34;
        color = mix(color, color * vec3(0.78, 0.83, 0.91), uDark * 0.14);

        float dist = distance(vWorldPos, uCamera);
        float aerial = 1.0 - exp(-pow(dist * 0.00043, 1.55));
        float valleyMist = smoothstep(105.0, 12.0, vWorldPos.y) * 0.12;
        color = mix(color, uFogColor, clamp(aerial * 0.34 + valleyMist, 0.0, 0.46));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

const buildFogRingGeometry = (inner: number, outer: number, y: number) => {
  const thetaSegments = 112;
  const radialSegments = 3;
  const vertices: number[] = [];
  const alphas: number[] = [];
  const indices: number[] = [];

  for (let thetaIndex = 0; thetaIndex <= thetaSegments; thetaIndex += 1) {
    const theta = (thetaIndex / thetaSegments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const hero = Math.exp(-(angleDiff(theta, -Math.PI / 2) ** 2) / (1.22 * 1.22));
    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const radial = radialIndex / radialSegments;
      const radius = inner + (outer - inner) * radial;
      vertices.push(cos * radius, y + Math.sin(theta * 4 + radial * 3) * 2.8, sin * radius);
      alphas.push((0.26 + hero * 0.44) * Math.sin(radial * Math.PI));
    }
  }

  const columns = radialSegments + 1;
  for (let thetaIndex = 0; thetaIndex < thetaSegments; thetaIndex += 1) {
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const a = thetaIndex * columns + radialIndex;
      const b = a + columns;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("mistAlpha", new THREE.Float32BufferAttribute(alphas, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

const createFogMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uFogColor: { value: new THREE.Color(0xd8e8e1) },
      uOpacity: { value: 0.18 },
      uTime: { value: 0 },
      uDark: { value: 0 },
    },
    vertexShader: `
      attribute float mistAlpha;
      varying vec3 vWorldPos;
      varying float vAlpha;

      void main() {
        vAlpha = mistAlpha;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      varying float vAlpha;
      uniform vec3 uFogColor;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uDark;
      ${GLSL_NOISE}

      void main() {
        float noise = bl_fbm(vWorldPos.xz * 0.006 + vec2(uTime * 0.012, -uTime * 0.008));
        float lift = smoothstep(110.0, 10.0, vWorldPos.y);
        float alpha = vAlpha * uOpacity * lift * (0.62 + noise * 0.56) * (1.0 - uDark * 0.18);
        if (alpha < 0.012) {
          discard;
        }
        gl_FragColor = vec4(uFogColor, alpha);
      }
    `,
  });

const createForestWall = () => {
  const group = new THREE.Group();
  group.name = "ScenicExperimental mountain-base forest wall";
  const rng = makeRng(6617);
  const massGeometry = new THREE.DodecahedronGeometry(7.8, 1);
  const spireGeometry = new THREE.ConeGeometry(3.4, 22, 7, 1);
  const massMaterial = new THREE.MeshStandardMaterial({
    color: 0x0f2a18,
    roughness: 0.96,
    vertexColors: true,
  });
  const spireMaterial = new THREE.MeshBasicMaterial({
    color: 0x07120d,
    vertexColors: true,
  });
  const massCount = 560;
  const spireCount = 380;
  const masses = new THREE.InstancedMesh(massGeometry, massMaterial, massCount);
  const spires = new THREE.InstancedMesh(spireGeometry, spireMaterial, spireCount);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();

  const place = (
    mesh: THREE.InstancedMesh,
    count: number,
    spire: boolean,
  ) => {
    for (let index = 0; index < count; index += 1) {
      const theta = -Math.PI / 2 + (rng() - 0.5) * Math.PI * 1.86 + Math.sin(index * 5.1) * 0.035;
      const radius = spire ? 640 + rng() * 210 : 610 + rng() * 250;
      const inland = THREE.MathUtils.clamp((radius - 610) / 260, 0, 1);
      position.set(
        Math.cos(theta) * radius + (rng() - 0.5) * 28,
        spire ? 12 + rng() * 10 + inland * 14 : 6 + rng() * 8 + inland * 11,
        Math.sin(theta) * radius + (rng() - 0.5) * 24,
      );
      quaternion.setFromAxisAngle(up, rng() * Math.PI * 2);
      if (spire) {
        const height = 0.62 + rng() * 1.25 + inland * 0.50;
        scale.set(0.62 + rng() * 0.70, height, 0.52 + rng() * 0.45);
        color.setHSL(0.35 + (rng() - 0.5) * 0.03, 0.24, 0.035 + rng() * 0.032);
      } else {
        scale.set(1.12 + inland * 1.10 + rng() * 0.62, 0.34 + inland * 0.18 + rng() * 0.20, 0.84 + rng() * 0.72);
        color.setHSL(0.335 + (rng() - 0.5) * 0.05, 0.28 + rng() * 0.12, 0.052 + rng() * 0.052);
      }
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.frustumCulled = false;
  };

  place(masses, massCount, false);
  place(spires, spireCount, true);
  group.add(masses, spires);
  return {
    group,
    instances: massCount + spireCount,
    setTone: (dark: number) => {
      massMaterial.color.setHex(dark > 0.55 ? 0x07140d : 0x12321d);
      spireMaterial.color.setHex(dark > 0.55 ? 0x020706 : 0x07110d);
    },
  };
};

export const createRealismSpikeSystem = (
  capabilities: RendererCapabilityTelemetry,
): RealismSpikeSystem => {
  const group = new THREE.Group();
  group.name = "Phase 66 ScenicExperimental realism spike";
  group.visible = false;

  const mountainGeometry = buildAlpineBackdropGeometry();
  const mountainMaterial = createAlpineBackdropMaterial();
  const mountains = new THREE.Mesh(mountainGeometry, mountainMaterial);
  mountains.name = "ScenicExperimental eroded alpine backdrop";
  mountains.frustumCulled = false;
  group.add(mountains);

  const forestWall = createForestWall();
  group.add(forestWall.group);

  const fogMaterial = createFogMaterial();
  const fogLayers = [
    new THREE.Mesh(buildFogRingGeometry(520, 920, 20), fogMaterial),
    new THREE.Mesh(buildFogRingGeometry(610, 1120, 52), fogMaterial.clone()),
  ];
  fogLayers.forEach((layer, index) => {
    layer.name = `ScenicExperimental height fog layer ${index + 1}`;
    layer.renderOrder = 3 + index;
    layer.frustumCulled = false;
    group.add(layer);
  });

  const stats: ScenicExperimentalStats = {
    ...capabilities,
    requested: false,
    active: false,
    reason: "not requested",
    mountainVertices: mountainGeometry.attributes.position.count,
    forestInstances: forestWall.instances,
    fogLayers: fogLayers.length,
  };

  return {
    group,
    update: (weather, camera, elapsed) => {
      if (!stats.active) {
        return;
      }
      const palette = getWeatherPalette(weather.stormIndex);
      const dark = weather.dials.skyDark;
      mountainMaterial.uniforms.uFogColor.value.setHex(palette.fogColor);
      mountainMaterial.uniforms.uAmbient.value.setHex(palette.ambientLight);
      mountainMaterial.uniforms.uSunColor.value.setHex(palette.directionalLight);
      mountainMaterial.uniforms.uDark.value = dark;
      mountainMaterial.uniforms.uFire.value = weather.dials.fireWeather;
      mountainMaterial.uniforms.uCamera.value.copy(camera.position);
      forestWall.setTone(dark);
      fogLayers.forEach((layer, index) => {
        const material = layer.material as THREE.ShaderMaterial;
        material.uniforms.uFogColor.value.setHex(palette.fogColor);
        material.uniforms.uOpacity.value = 0.070 + weather.dials.fog * 0.13 + index * 0.026;
        material.uniforms.uDark.value = dark;
        material.uniforms.uTime.value = elapsed;
      });
    },
    setGate: (gate) => {
      stats.requested = gate.requested;
      stats.active = gate.active;
      stats.reason = gate.reason;
      group.visible = gate.active;
    },
    getStats: () => ({ ...stats }),
  };
};
