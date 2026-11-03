export interface VisemeState {
  /** Mandibular depression / oral aperture [0, 1] */
  jawOpen: number;
  /** Labial spreading / lateral expansion [0, 1] */
  mouthWide: number;
  /** Labial puckering / O-shaping [0, 1] */
  mouthRound: number;
}

export interface HeadPose {
  /** Yaw rotation in radians (left/right) */
  yaw: number;
  /** Pitch rotation in radians (up/down) */
  pitch: number;
  /** Roll rotation in radians (tilt) */
  roll: number;
  /** Normalized screen space X center [-0.5, 0.5] */
  screenX?: number;
  /** Normalized screen space Y center [-0.5, 0.5] */
  screenY?: number;
  /** True when head pose was extracted from valid live facial landmarks */
  isTracking?: boolean;
}

export interface LanternEyesProps {
  /** Audio RMS energy [0, 1] driving speech pulsing */
  audioRms?: number;
  /** True when spectator gaze locks onto avatar or card */
  gazeLocked?: boolean;
  /** Temporary reveal pulse scalar [0, 1] */
  revealPulse?: number;
  /** When true, disables high-frequency flicker and clamps brightness */
  reducedMotion?: boolean;
  /** Spectator head pose tracking */
  headPose?: Partial<HeadPose> | null;
  /** Local position offset */
  position?: [number, number, number];
  /** Local scale factor */
  scale?: number;
}

export interface BrassMaskProps {
  /** Root position in Stage 3D coordinates. Default: [0, 1.85, -1.8] */
  position?: [number, number, number];
  /** Root rotation Euler angles [x, y, z] */
  rotation?: [number, number, number];
  /** Scale factor. Default: 0.92 */
  scale?: number;
  /** Audio RMS amplitude [0, 1] */
  audioRms?: number;
  /** Real-time phoneme envelopes for facial animation */
  visemes?: Partial<VisemeState>;
  /** Spectator head pose tracking */
  headPose?: Partial<HeadPose> | null;
  /** True when spectator gaze locks onto avatar or card */
  gazeLocked?: boolean;
  /** Reveal pulse trigger from stage */
  revealPulse?: number;
  /** Current session phase (e.g. "think", "probe", "reveal") */
  phase?: string;
  /** True when voice or synthetic patter cue is actively speaking */
  speaking?: boolean;
  /** Freezes continuous drift and floating bobbing */
  reducedMotion?: boolean;
}

export interface AvatarTelemetry {
  mounted: boolean;
  visemes: VisemeState;
  headPose: HeadPose;
  eyeIntensity: number;
  gazeLocked: boolean;
  speaking: boolean;
  audioRms: number;
  lastFrameTime: number;
}

declare global {
  interface Window {
    __LOKI_AVATAR_STATE__?: AvatarTelemetry;
  }
}
