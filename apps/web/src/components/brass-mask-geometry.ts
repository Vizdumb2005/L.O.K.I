import * as THREE from "three";

export interface MaskGeometries {
  cranium: THREE.BufferGeometry;
  brow: THREE.BufferGeometry;
  orbitalBezel: THREE.BufferGeometry;
  nose: THREE.BufferGeometry;
  cheek: THREE.BufferGeometry;
  philtrum: THREE.BufferGeometry;
  mandible: THREE.BufferGeometry;
  backing: THREE.BufferGeometry;
}

/**
 * Procedural Three.js BufferGeometries for the Nocturne Artificer brass mask avatar.
 * Generates ~716 triangles (strictly < 1000 budget) without loading external glTF/binary assets.
 */
export function createProceduralMaskGeometries(): MaskGeometries {
  // 1. Forehead Cranium (Curved cylindrical shell segment: 16 radial, 2 height segments = 64 tris)
  const cranium = new THREE.CylinderGeometry(
    0.74,
    0.8,
    0.62,
    16,
    2,
    true,
    -Math.PI * 0.44,
    Math.PI * 0.88
  );

  // 2. Brow Ridge (Heavy horizontal chevron bar creating deep chiaroscuro orbital shadows)
  const brow = new THREE.BoxGeometry(1.42, 0.16, 0.22, 6, 2, 2);
  const browPos = brow.attributes.position;
  if (browPos) {
    for (let i = 0; i < browPos.count; i++) {
      const x = browPos.getX(i);
      const factor = 1.0 - Math.min(1.0, Math.abs(x) * 0.55);
      browPos.setZ(i, browPos.getZ(i) * factor);
    }
    brow.computeVertexNormals();
  }

  // 3. Orbital Eye Bezels (Beveled rings framing lantern eyes: 6 radial, 16 tubular = 192 tris)
  const orbitalBezel = new THREE.TorusGeometry(0.19, 0.045, 6, 16, Math.PI * 1.85);

  // 4. Nose Bridge Pyramid (Sharp beveled wedge)
  const nose = new THREE.ConeGeometry(0.24, 0.56, 4, 1, false, Math.PI * 0.25);
  const nosePos = nose.attributes.position;
  if (nosePos) {
    for (let i = 0; i < nosePos.count; i++) {
      nosePos.setZ(i, nosePos.getZ(i) * 1.5);
    }
    nose.computeVertexNormals();
  }

  // 5. Zygomatic Cheek Plates (Faceted swept plate)
  const cheek = new THREE.BoxGeometry(0.48, 0.52, 0.08, 2, 2, 1);

  // 6. Philtrum / Upper Lip
  const philtrum = new THREE.BoxGeometry(0.38, 0.14, 0.12);

  // 7. Articulated Mandible / Lower Jaw & Chin (Chiseled chin taper)
  const mandible = new THREE.BoxGeometry(0.68, 0.46, 0.28, 4, 3, 2);
  const mandPos = mandible.attributes.position;
  if (mandPos) {
    for (let i = 0; i < mandPos.count; i++) {
      const y = mandPos.getY(i);
      if (y < 0) {
        mandPos.setX(i, mandPos.getX(i) * 0.72);
        mandPos.setZ(i, mandPos.getZ(i) * 0.85);
      }
    }
    mandible.computeVertexNormals();
  }

  // 8. Interior Obsidian Backing Shell (12 width, 8 height segments = 192 tris)
  const backing = new THREE.SphereGeometry(
    0.78,
    12,
    8,
    -Math.PI * 0.5,
    Math.PI,
    Math.PI * 0.1,
    Math.PI * 0.8
  );

  return {
    cranium,
    brow,
    orbitalBezel,
    nose,
    cheek,
    philtrum,
    mandible,
    backing
  };
}

export function disposeMaskGeometries(geos: MaskGeometries): void {
  Object.values(geos).forEach((g) => g.dispose());
}
