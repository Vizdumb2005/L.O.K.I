import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { cardTargetPosition } from "./stage-layout.js";

describe("3D reveal framing", () => {
  it("centers a revealed item regardless of its shuffled slot", () => {
    for (const x of [-2.37, -0.79, 0.79, 2.37]) {
      for (const y of [-1.63, 0.35, 2.33]) {
        expect(cardTargetPosition({ x, y, z: -0.21 }, true, 0.05, 0)).toEqual({ x: 0, y: 0.35, z: 2.1 });
      }
    }
    expect(cardTargetPosition({ x: 1, y: 2, z: 0 }, false, 0.05, 0)).toEqual({ x: 1, y: 2.05, z: 0 });
  });

  it("keeps every enlarged reveal corner inside desktop and mobile viewports", () => {
    for (const width of [364, 900, 1280]) {
      for (const height of [300, 500]) {
        for (const reducedMotion of [false, true]) {
          const camera = new PerspectiveCamera(37, width / height, 0.1, 40);
          camera.position.set(0, 1.1, 9.6);
          if (!reducedMotion) camera.lookAt(0, 0.2, 0);
          camera.updateMatrixWorld();
          const sceneScale = Math.min(1.06, Math.max(0.56, width / 980));
          const target = cardTargetPosition({ x: 2.37, y: 2.33, z: -0.21 }, true, 0, 1);
          for (const x of [-0.65, 0.65]) {
            for (const y of [-0.9, 0.9]) {
              const corner = new Vector3(
                (target.x + x * 1.18) * sceneScale,
                (target.y + y * 1.18) * sceneScale + 0.05,
                (target.z + 0.05) * sceneScale
              ).project(camera);
              expect(Math.abs(corner.x)).toBeLessThan(0.96);
              expect(Math.abs(corner.y)).toBeLessThan(0.96);
            }
          }
        }
      }
    }
  });
});
