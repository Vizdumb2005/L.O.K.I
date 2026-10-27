import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { cardTargetPosition, stageGridScale } from "./stage-layout.js";

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


describe("grid framing", () => {
  it("keeps all four-by-three grid corners visible in short desktop and mobile stages", () => {
    for (const width of [336, 900, 1280]) {
      for (const height of [300, 500]) {
        const camera = new PerspectiveCamera(37, width / height, 0.1, 40);
        camera.position.set(0, 1.1, 9.6);
        camera.lookAt(0, 0.2, 0);
        camera.updateMatrixWorld();
        const worldHeight = 2 * Math.tan(37 * Math.PI / 360) * camera.position.distanceTo(new Vector3(0, 0.2, 0));
        const scale = stageGridScale(width, worldHeight, 3);
        for (const x of [-2.37 - 0.65, 2.37 + 0.65]) {
          for (const y of [-1.63 - 0.9, 2.33 + 0.9]) {
            const corner = new Vector3(x * scale, y * scale + 0.05, 0).project(camera);
            expect(Math.abs(corner.x)).toBeLessThan(0.96);
            expect(Math.abs(corner.y)).toBeLessThan(0.96);
          }
        }
      }
    }
  });
});
