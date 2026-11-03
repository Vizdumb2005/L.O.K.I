import * as THREE from "three";

export interface CaravaggioMaterialUniforms {
  uBaseColor: { value: THREE.Color };
  uShadowColor: { value: THREE.Color };
  uKeyLightPos: { value: THREE.Vector3 };
  uKeyLightColor: { value: THREE.Color };
  uRimLightPos: { value: THREE.Vector3 };
  uRimLightColor: { value: THREE.Color };
  uRoughness: { value: number };
  uMetalness: { value: number };
  uChiaroscuroCurve: { value: number };
  uTime: { value: number };
  [uniform: string]: THREE.IUniform;
}

/**
 * Bespoke single-pass Cook-Torrance GGX shader material for the brass mask.
 * Enforces Caravaggio tenebrism: warm burnished brass reflections on lit surfaces
 * plunging steeply into deep obsidian shadow (#0a1210) with verdigris rim lighting.
 */
export function createCaravaggioBrassMaterial(): THREE.ShaderMaterial {
  const uniforms: CaravaggioMaterialUniforms = {
    uBaseColor: { value: new THREE.Color("#d8b877") },
    uShadowColor: { value: new THREE.Color("#0a1210") },
    uKeyLightPos: { value: new THREE.Vector3(4.0, 7.0, 6.0) },
    uKeyLightColor: { value: new THREE.Color("#ffe7ba") },
    uRimLightPos: { value: new THREE.Vector3(-6.0, 2.0, -4.0) },
    uRimLightColor: { value: new THREE.Color("#4da193") },
    uRoughness: { value: 0.35 },
    uMetalness: { value: 0.92 },
    uChiaroscuroCurve: { value: 2.8 },
    uTime: { value: 0.0 }
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vec4 mvPosition = viewMatrix * worldPos;
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform vec3 uBaseColor;
      uniform vec3 uShadowColor;
      uniform vec3 uKeyLightPos;
      uniform vec3 uKeyLightColor;
      uniform vec3 uRimLightPos;
      uniform vec3 uRimLightColor;
      uniform float uRoughness;
      uniform float uMetalness;
      uniform float uChiaroscuroCurve;

      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      float hammeredFacet(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }

      void main() {
        vec3 facetCoord = vWorldPosition * 24.0;
        float h1 = hammeredFacet(facetCoord);
        float h2 = hammeredFacet(facetCoord + vec3(3.7, 1.2, 5.9));
        vec3 bump = vec3(h1 - 0.5, h2 - 0.5, 0.0) * 0.06;
        vec3 N = normalize(vNormal + bump);
        vec3 V = normalize(vViewPosition);

        vec3 L = normalize(uKeyLightPos - vWorldPosition);
        vec3 H = normalize(L + V);

        float nDotL = dot(N, L);
        float nDotV = max(dot(N, V), 0.001);
        float nDotH = max(dot(N, H), 0.0);
        float vDotH = max(dot(V, H), 0.0);

        // Caravaggio Chiaroscuro Shadow Falloff
        float chiaroscuro = smoothstep(-0.02, 0.32, nDotL);
        chiaroscuro = pow(chiaroscuro, uChiaroscuroCurve);

        // Cook-Torrance GGX Specular
        float alpha = uRoughness * uRoughness;
        float alpha2 = alpha * alpha;
        float denomD = (nDotH * nDotH * (alpha2 - 1.0) + 1.0);
        float D = alpha2 / (3.14159265 * denomD * denomD + 0.0001);

        float k = (uRoughness + 1.0) * (uRoughness + 1.0) / 8.0;
        float gV = nDotV / (nDotV * (1.0 - k) + k);
        float gL = max(nDotL, 0.0) / (max(nDotL, 0.0) * (1.0 - k) + k);
        float G = gV * gL;

        vec3 F0 = mix(vec3(0.04), uBaseColor, uMetalness);
        vec3 F = F0 + (1.0 - F0) * pow(1.0 - vDotH, 5.0);

        vec3 specular = (D * G * F) / (4.0 * nDotV * max(nDotL, 0.0) + 0.001);
        vec3 kD = (vec3(1.0) - F) * (1.0 - uMetalness);
        vec3 diffuse = kD * uBaseColor * max(nDotL, 0.0);

        vec3 directLight = (diffuse + specular) * uKeyLightColor * chiaroscuro * 2.2;

        // Rim Light on shadowed contour (Verdigris #4da193)
        vec3 Lrim = normalize(uRimLightPos - vWorldPosition);
        float nDotLrim = max(dot(N, Lrim), 0.0);
        float rimFresnel = pow(1.0 - nDotV, 3.5);
        vec3 rim = uRimLightColor * rimFresnel * nDotLrim * 1.4;

        vec3 litSurface = directLight + rim;
        vec3 finalColor = mix(uShadowColor, litSurface, chiaroscuro);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
  });
}

/**
 * Interior backing cup material (matte dark emerald obsidian #0a1210).
 */
export function createObsidianBackingMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: "#0a1210",
    roughness: 0.95,
    metalness: 0.1,
    side: THREE.BackSide
  });
}
