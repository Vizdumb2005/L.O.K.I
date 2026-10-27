import { Component, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Effect } from "@loki/effect-api";
import type { SessionView } from "@loki/showrunner";
import { cardTargetPosition } from "./stage-layout.js";

const GOLD = "#d8b877";
const INK = "#16231f";

function hash(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function faceTexture(label: string, glyph: string, index: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 716;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const gradient = ctx.createLinearGradient(0, 0, 512, 716);
  gradient.addColorStop(0, "#f4ead7");
  gradient.addColorStop(0.55, "#e8dcc4");
  gradient.addColorStop(1, "#d9c9ab");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 716);

  ctx.strokeStyle = "rgba(64, 52, 32, 0.45)";
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, 468, 672);
  ctx.strokeStyle = "rgba(64, 52, 32, 0.18)";
  ctx.lineWidth = 1;
  ctx.strokeRect(38, 38, 436, 640);

  ctx.fillStyle = "rgba(70, 54, 28, 0.55)";
  ctx.font = "500 18px 'Courier New', monospace";
  ctx.textAlign = "left";
  ctx.fillText("LOKI · THE OBSERVATORY", 48, 68);

  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = "500 230px Georgia, 'Times New Roman', serif";
  ctx.fillText(glyph, 256, 360);

  ctx.fillStyle = "rgba(22, 35, 31, 0.92)";
  ctx.font = "italic 32px Georgia, 'Times New Roman', serif";
  const words = label.split(" ");
  if (words.length > 2) {
    ctx.fillText(words.slice(0, 2).join(" "), 256, 540);
    ctx.fillText(words.slice(2).join(" "), 256, 578);
  } else {
    ctx.fillText(label, 256, 558);
  }

  ctx.fillStyle = "rgba(67, 51, 25, 0.55)";
  ctx.font = "500 16px 'Courier New', monospace";
  ctx.fillText(`NO. ${String(index + 1).padStart(2, "0")}`, 256, 646);

  ctx.strokeStyle = "rgba(95, 74, 39, 0.28)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const y = 100 + hash(i + index * 13) * 520;
    ctx.beginPath();
    ctx.moveTo(48 + hash(i * 3) * 120, y);
    ctx.lineTo(464 - hash(i * 5) * 120, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

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
  const texture = useMemo(() => faceTexture(label, glyph, index), [label, glyph, index]);
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

interface SceneProps {
  effect: Effect;
  view: SessionView;
  reducedMotion: boolean;
}

function Scene({ view, reducedMotion }: SceneProps) {
  const stage = view.stage;
  const columns = Math.max(1, stage.columns);
  const rows = Math.max(1, Math.ceil(stage.items.length / columns));
  const { size } = useThree();
  const scale = Math.min(1.06, Math.max(0.56, size.width / 980));
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
      camera.lookAt(0, 0.2, 0);
    }
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
      {view.stage.items.map((item) => (
        <div
          key={item.hypothesisId}
          className={`flat-card ${view.reveal?.id === item.hypothesisId ? "is-revealed" : ""}`}
        >
          <span className="flat-glyph">{item.glyph}</span>
          <span>{item.label}</span>
        </div>
      ))}
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
