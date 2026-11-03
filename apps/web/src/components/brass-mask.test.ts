import { describe, expect, it } from "vitest";
import {
  createProceduralMaskGeometries,
  disposeMaskGeometries
} from "./brass-mask-geometry.js";
import {
  createCaravaggioBrassMaterial,
  createObsidianBackingMaterial
} from "./CaravaggioBrassMaterial.js";

describe("BrassMask Procedural Architecture (F13)", () => {
  it("creates all 8 procedural Three.js BufferGeometries without NaNs", () => {
    const geos = createProceduralMaskGeometries();

    expect(geos.cranium).toBeDefined();
    expect(geos.brow).toBeDefined();
    expect(geos.orbitalBezel).toBeDefined();
    expect(geos.nose).toBeDefined();
    expect(geos.cheek).toBeDefined();
    expect(geos.philtrum).toBeDefined();
    expect(geos.mandible).toBeDefined();
    expect(geos.backing).toBeDefined();

    // Verify non-empty vertex buffers and valid bounding spheres
    Object.entries(geos).forEach(([name, geo]) => {
      const pos = geo.attributes.position;
      expect(pos, `Geometry ${name} missing position attribute`).toBeDefined();
      expect(pos.count, `Geometry ${name} has 0 vertices`).toBeGreaterThan(0);

      // Verify no NaN or Infinity coordinates
      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i)), `NaN found in ${name}.x`).toBe(true);
        expect(Number.isFinite(pos.getY(i)), `NaN found in ${name}.y`).toBe(true);
        expect(Number.isFinite(pos.getZ(i)), `NaN found in ${name}.z`).toBe(true);
      }
    });

    disposeMaskGeometries(geos);
  });

  it("configures Caravaggio Cook-Torrance GGX PBR shader uniforms correctly", () => {
    const mat = createCaravaggioBrassMaterial();

    expect(mat.uniforms.uBaseColor.value.getHexString()).toBe("d8b877");
    expect(mat.uniforms.uShadowColor.value.getHexString()).toBe("0a1210");
    expect(mat.uniforms.uRoughness.value).toBe(0.35);
    expect(mat.uniforms.uMetalness.value).toBe(0.92);
    expect(mat.uniforms.uChiaroscuroCurve.value).toBe(2.8);
    expect(mat.uniforms.uRimLightColor.value.getHexString()).toBe("4da193");

    mat.dispose();
  });

  it("configures obsidian backing material with high roughness and dark tone", () => {
    const mat = createObsidianBackingMaterial();
    expect(mat.color.getHexString()).toBe("0a1210");
    expect(mat.roughness).toBe(0.95);
    mat.dispose();
  });

  it("enforces procedural geometry budget strictly below 1000 triangles (~700-750 tris target)", () => {
    const geos = createProceduralMaskGeometries();
    let totalTris = 0;
    const segmentCounts: Record<string, number> = {};

    for (const [name, geo] of Object.entries(geos)) {
      const tris = geo.index ? geo.index.count / 3 : (geo.attributes.position?.count ?? 0) / 3;
      segmentCounts[name] = tris;
      totalTris += tris;
    }

    expect(totalTris).toBeLessThan(1000);
    expect(totalTris).toBeGreaterThan(500);
    expect(segmentCounts.orbitalBezel).toBeLessThanOrEqual(256);
    expect(segmentCounts.backing).toBeLessThanOrEqual(256);
    expect(segmentCounts.cranium).toBeLessThanOrEqual(128);

    disposeMaskGeometries(geos);
  });
});
