import { describe, expect, it } from "vitest";
import { localMediaPipePaths } from "./mediapipe-paths.js";

// MAJ-02: MediaPipe assets must resolve under the deploy BASE_URL (GitHub Pages
// serves from /L.O.K.I/), never from the site root.
describe("MAJ-02: MediaPipe asset paths resolve under BASE_URL", () => {
  it("keeps the dev-root default working", () => {
    expect(localMediaPipePaths("/")).toEqual({
      wasm: "/mediapipe/wasm",
      model: "/mediapipe/face_landmarker.task"
    });
  });

  it("prefixes the GitHub Pages base without doubling slashes", () => {
    expect(localMediaPipePaths("/L.O.K.I/")).toEqual({
      wasm: "/L.O.K.I/mediapipe/wasm",
      model: "/L.O.K.I/mediapipe/face_landmarker.task"
    });
  });

  it("tolerates a base without a trailing slash", () => {
    expect(localMediaPipePaths("/L.O.K.I")).toEqual({
      wasm: "/L.O.K.I/mediapipe/wasm",
      model: "/L.O.K.I/mediapipe/face_landmarker.task"
    });
  });
});
