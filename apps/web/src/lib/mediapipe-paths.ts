/**
 * MAJ-02: MediaPipe asset URLs must resolve under the deploy BASE_URL.
 * GitHub Pages serves the site from /<repo>/, so absolute-root paths 404
 * before falling back to the third-party CDN.
 */
export interface MediaPipePaths {
  wasm: string;
  model: string;
}

export function localMediaPipePaths(baseUrl: string): MediaPipePaths {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return {
    wasm: `${base}mediapipe/wasm`,
    model: `${base}mediapipe/face_landmarker.task`
  };
}
