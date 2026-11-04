import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Effect } from "@loki/effect-api";
import type { SessionView } from "@loki/showrunner";
import { cardPalette, cardTargetPosition, stageGridScale, type CardPalette } from "./stage-layout.js";
import { createFaceTexture, disposeFaceTexture, hash } from "./face-texture.js";
import { BrassMask } from "./BrassMask.js";
import type { VisemeState, HeadPose } from "./avatar-types.js";

export { cardPalette, type CardPalette };

const GOLD = "#d8b877";


interface CardProps {
  label: string;
  glyph: string;
  index: number;
  columns: number;
  rows: number;
  highlighted: boolean;
  dimmed: boolean;
  reducedMotion: boolean;
  revealPulse: number;
}

function Card({
  label,
  glyph,
  index,
  columns,
  rows,
  highlighted,
  dimmed,
  reducedMotion,
  revealPulse
}: CardProps) {
  const group = useRef<THREE.Group>(null);
  const face = useRef<THREE.MeshStandardMaterial>(null);
  const texture = useMemo(() => createFaceTexture(label, glyph, index), [label, glyph, index]);
  // Imperatively created textures are not auto-disposed by r3f; release GPU memory on unmount.
  useEffect(() => () => disposeFaceTexture(texture), [texture]);
  const col = index % columns;
  const row = Math.floor(index / columns);
  const x = (col - (columns - 1) / 2) * 1.58;
  const y = ((rows - 1) / 2 - row) * 1.98;
  const base = useMemo(
    () => new THREE.Vector3(x, y + 0.35, -Math.abs(col - (columns - 1) / 2) * 0.14),
    [x, y, col, columns]
  );

  useFrame(({ clock }) => {
    const node = group.current;
    if (!node) return;
    const t = clock.getElapsedTime();
    const drift = reducedMotion ? 0 : Math.sin(t * 0.6 + index * 0.9) * 0.055;
    const target = cardTargetPosition(base, highlighted, drift, revealPulse);
    const targetScale = highlighted ? 1.18 : dimmed ? 0.94 : 1;
    node.position.x += (target.x - node.position.x) * 0.08;
    node.position.y += (target.y - node.position.y) * 0.08;
    node.position.z += (target.z - node.position.z) * 0.08;
    node.rotation.x += ((highlighted ? -0.04 : 0.05) - node.rotation.x) * 0.06;
    node.rotation.y += ((highlighted ? 0 : (col - (columns - 1) / 2) * 0.07) - node.rotation.y) * 0.06;
    node.scale.setScalar(node.scale.x + (targetScale - node.scale.x) * 0.08);
    if (face.current) {
      const targetOpacity = dimmed ? 0.28 : 1;
      face.current.opacity += (targetOpacity - face.current.opacity) * 0.08;
    }
  });

  return (
    <group ref={group} position={base.toArray()} rotation={[0.05, 0, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.22, 1.72, 0.055]} />
        <meshStandardMaterial color={dimmed ? "#3d4038" : "#d5c6a9"} roughness={0.82} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0, 0.031]}>
        <planeGeometry args={[1.17, 1.67]} />
        <meshStandardMaterial
          ref={face}
          map={texture}
          roughness={0.72}
          metalness={0.04}
          transparent
          opacity={dimmed ? 0.28 : 1}
          emissive={highlighted ? "#6b5124" : "#000000"}
          emissiveIntensity={highlighted ? 0.24 : 0}
        />
      </mesh>
      {highlighted && (
        <mesh position={[0, 0, 0.05]}>
          <planeGeometry args={[1.3, 1.8]} />
          <meshBasicMaterial color={GOLD} transparent opacity={0.2} />
        </mesh>
      )}
    </group>
  );
}

export interface StageProps {
  effect: Effect;
  view: SessionView;
  reducedMotion: boolean;
  audioRms?: number;
  visemes?: Partial<VisemeState>;
  headPose?: Partial<HeadPose> | null;
  gazeLocked?: boolean;
  speaking?: boolean;
}

export type SceneProps = StageProps;

function Scene({
  view,
  reducedMotion,
  audioRms,
  visemes,
  headPose,
  gazeLocked,
  speaking
}: SceneProps) {
  const stage = view.stage;
  const columns = Math.max(1, stage.columns);
  const rows = Math.max(1, Math.ceil(stage.items.length / columns));
  const { size, viewport, camera } = useThree();
  const worldHeight = viewport.getCurrentViewport(camera, new THREE.Vector3(0, 0.2, 0)).height;
  const scale = stageGridScale(size.width, worldHeight, rows);
  const revealed = view.reveal?.id;
  const revealPulse = useRef(0);
  const ring = useRef<THREE.Group>(null);

  const stars = useMemo(() => {
    const positions = new Float32Array(260 * 3);
    for (let i = 0; i < 260; i++) {
      positions[i * 3] = (hash(i * 3 + 1) - 0.5) * 17;
      positions[i * 3 + 1] = (hash(i * 7 + 2) - 0.5) * 11;
      positions[i * 3 + 2] = -2 - hash(i * 11 + 5) * 9;
    }
    return positions;
  }, []);

  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime();
    revealPulse.current = Math.max(0, revealPulse.current - 0.012);
    if (!reducedMotion) {
      camera.position.x = Math.sin(t * 0.085) * 0.28;
      camera.position.y = 1.05 + Math.sin(t * 0.11) * 0.08;
    }
    // Reduced motion freezes drift, not the framing direction.
    camera.lookAt(0, 0.2, 0);
    if (ring.current) {
      const pulse = 1 + Math.sin(t * 0.9) * 0.012 + revealPulse.current * 0.04;
      ring.current.scale.setScalar(pulse);
    }
  });

  return (
    <>
      <fog attach="fog" args={["#07110f", 7, 19]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 7, 6]} intensity={2.1} color="#ffe7ba" />
      <directionalLight position={[-6, 2, -4]} intensity={1.1} color="#4da193" />
      <pointLight position={[0, -2.5, 4]} intensity={9} color="#c78e45" distance={12} />
      <pointLight position={[0, 1, 7]} intensity={5} color="#fff1d4" distance={20} />

      {/* Procedural Chiaroscuro Brass Mask Avatar (F13, F14, F15, F16) */}
      <BrassMask
        position={[0, 1.85, -1.8]}
        scale={0.92}
        audioRms={audioRms}
        visemes={visemes}
        headPose={headPose}
        gazeLocked={gazeLocked}
        revealPulse={revealPulse.current}
        phase={view.phase}
        speaking={speaking}
        reducedMotion={reducedMotion}
      />

      <group scale={scale} position={[0, 0.05, 0]}>
        {stage.items.map((item, index) => (
          <Card
            key={item.hypothesisId}
            label={item.label}
            glyph={item.glyph ?? "·"}
            index={index}
            columns={columns}
            rows={rows}
            highlighted={revealed === item.hypothesisId}
            dimmed={Boolean(revealed && revealed !== item.hypothesisId)}
            reducedMotion={reducedMotion}
            revealPulse={revealPulse.current}
          />
        ))}
      </group>

      <group ref={ring} position={[0, -3.12, 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <ringGeometry args={[4.55, 4.66, 96]} />
          <meshBasicMaterial color={GOLD} transparent opacity={0.42} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 6]}>
          <ringGeometry args={[3.4, 3.44, 6]} />
          <meshBasicMaterial color="#7fae9f" transparent opacity={0.24} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <mesh position={[0, -3.36, 0]} receiveShadow>
        <cylinderGeometry args={[4.7, 4.95, 0.24, 72]} />
        <meshStandardMaterial color="#0b1a17" roughness={0.62} metalness={0.35} />
      </mesh>

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[stars, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#cbb47d" size={0.026} transparent opacity={0.65} sizeAttenuation />
      </points>
    </>
  );
}

class StageBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override componentDidCatch(error: unknown): void {
    console.error("3D stage failed; using the flat stage.", error);
  }
  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function FlatStage({ view }: { view: SessionView }) {
  return (
    <div
      className={`flat-stage ${view.reveal ? "has-reveal" : ""}`}
      role="img"
      aria-label={`${view.stage.title} card table`}
    >
      <div className="flat-avatar-badge" aria-hidden="true">
        <svg viewBox="0 0 100 120" className="flat-mask-svg" width="48" height="58">
          <path
            d="M 20 20 Q 50 10 80 20 Q 90 60 75 95 Q 50 115 25 95 Q 10 60 20 20 Z"
            fill="#1c2b27"
            stroke="#d8b877"
            strokeWidth="2.5"
          />
          <circle cx="36" cy="45" r="4.5" fill="#e68a00" className="flat-eye-glow" />
          <circle cx="64" cy="45" r="4.5" fill="#e68a00" className="flat-eye-glow" />
          <polygon points="50,42 46,65 54,65" fill="#d8b877" opacity="0.75" />
          <path d="M 38 82 Q 50 88 62 82" stroke="#d8b877" strokeWidth="2" fill="none" />
        </svg>
      </div>
      {view.stage.items.map((item) => {
        const palette = cardPalette(item.glyph ?? "", item.label);
        const focused = view.reveal?.id === item.hypothesisId;
        return (
          <div
            key={item.hypothesisId}
            className={`flat-card ${palette.isRedSuit ? "is-red" : ""} ${focused ? "is-revealed" : ""}`}
          >
            <>
              <span className="flat-glyph" style={{ color: palette.glyph }}>
                {item.glyph}
              </span>
              <span>{item.label}</span>
            </>
          </div>
        );
      })}
    </div>
  );
}

export function Stage(props: SceneProps) {
  const [webglLost, setWebglLost] = useState(false);

  return (
    <div className="stage-wrap" aria-hidden="true">
      {webglLost ? (
        <FlatStage view={props.view} />
      ) : (
        <StageBoundary fallback={<FlatStage view={props.view} />}>
          <Canvas
            dpr={[1, 1.5]}
            camera={{ position: [0, 1.1, 9.6], fov: 37, near: 0.1, far: 40 }}
            gl={{ antialias: false, alpha: true, powerPreference: "default" }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener(
                "webglcontextlost",
                (event) => {
                  event.preventDefault();
                  console.warn("3D stage lost the WebGL context; using the flat stage.");
                  setWebglLost(true);
                },
                { once: true }
              );
            }}
          >
            <Scene {...props} />
          </Canvas>
        </StageBoundary>
      )}
    </div>
  );
}