'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface ExplodedPump3DProps {
  onSelectComponent?: (componentId: string, label: string) => void;
  selectedComponentId?: string | null;
  /**
   * Leave the scene unpainted so the page shows through. Used where the pump
   * is a subject rather than a tool — the landing page stands it in the gap
   * between two lines of the wordmark, and a white plate behind it would hide
   * the lower line.
   */
  transparent?: boolean;
}

// 12 distinct mechanical subassemblies that translate along the X axis
interface MechanicalPart {
  id: string;
  assembledX: number;
  explodeX: number;
}

const MECHANICAL_PARTS: MechanicalPart[] = [
  { id: 'shaft_retaining_ring', assembledX: -9, explodeX: -26 },
  { id: 'bearing_retaining_ring', assembledX: -8, explodeX: -21.5 },
  { id: 'ball_bearing', assembledX: -7, explodeX: -17 },
  { id: 'shaft_seal', assembledX: -6, explodeX: -12.5 },
  { id: 'tapered_roller_bearing', assembledX: -4.5, explodeX: -8 },
  { id: 'housing', assembledX: -3.5, explodeX: -3.5 }, // Central reference anchor
  { id: 'camshaft_swashplate', assembledX: -3.5, explodeX: 1.5 },
  { id: 'holddown_plate', assembledX: -1.5, explodeX: 5.5 },
  { id: 'piston_inlet_check_valve', assembledX: -0.5, explodeX: 9.5 },
  { id: 'barrel', assembledX: 1.5, explodeX: 14.5 },
  { id: 'cover_ball_check_valves', assembledX: 3.9, explodeX: 19 },
  { id: 'full_flow_cover', assembledX: 5.5, explodeX: 23.5 },
];

// 14 interactive callout labels matching Photo 1 exactly
interface CalloutLabel {
  id: string;
  groupId: string; // Parent mechanical group it tracks in 3D space
  label: string;
  offsetY: number;
  offsetX: number;
}

const CALLOUT_LABELS: CalloutLabel[] = [
  { id: 'shaft_retaining_ring', groupId: 'shaft_retaining_ring', label: 'Shaft Retaining Ring', offsetY: -9, offsetX: -2 },
  { id: 'bearing_retaining_ring', groupId: 'bearing_retaining_ring', label: 'Bearing Retaining Ring', offsetY: -7, offsetX: -1 },
  { id: 'ball_bearing', groupId: 'ball_bearing', label: 'Ball Bearing', offsetY: -9, offsetX: 0 },
  { id: 'shaft_seal', groupId: 'shaft_seal', label: 'Shaft Seal', offsetY: -7, offsetX: 1 },
  { id: 'tapered_roller_bearing', groupId: 'tapered_roller_bearing', label: 'Tapered Roller Bearing', offsetY: 7.5, offsetX: 0 },
  { id: 'housing', groupId: 'housing', label: 'Shaft Seal & Body', offsetY: -7, offsetX: -2 },
  { id: 'inlet', groupId: 'housing', label: 'Inlet', offsetY: 9.5, offsetX: 0 },
  { id: 'camshaft_swashplate', groupId: 'camshaft_swashplate', label: 'Camshaft & Swashplate', offsetY: -7, offsetX: 1 },
  { id: 'holddown_plate', groupId: 'holddown_plate', label: 'Holddown Plate', offsetY: -9, offsetX: 2 },
  { id: 'piston_inlet_check_valve', groupId: 'piston_inlet_check_valve', label: 'Piston with Inlet Check Valve', offsetY: 8.5, offsetX: 0 },
  { id: 'barrel', groupId: 'barrel', label: 'Barrel', offsetY: 7.5, offsetX: 1 },
  { id: 'cover_ball_check_valves', groupId: 'cover_ball_check_valves', label: 'Cover Ball Check Valves', offsetY: 9.5, offsetX: 0 },
  { id: 'full_flow_cover', groupId: 'full_flow_cover', label: 'Full Flow Cover', offsetY: 8.5, offsetX: 2 },
  { id: 'outlet', groupId: 'full_flow_cover', label: 'Outlet', offsetY: 12, offsetX: 0 },
];

/**
 * Creates an authentic stamped circlip / snap ring with two eyelet lugs and holes
 */
function createSnapRingGeometry(radius: number, thickness: number, isInternal: boolean): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const outerR = radius;
  const innerR = radius - thickness;
  const gapAngle = 0.55;

  shape.absarc(0, 0, outerR, gapAngle / 2, Math.PI * 2 - gapAngle / 2, false);

  const lugAngle1 = Math.PI * 2 - gapAngle / 2;
  const lugR = thickness * 0.9;
  const lugDist = isInternal ? innerR - lugR * 0.5 : outerR + lugR * 0.5;
  const lx1 = Math.cos(lugAngle1) * lugDist;
  const ly1 = Math.sin(lugAngle1) * lugDist;
  shape.lineTo(lx1, ly1);

  shape.absarc(0, 0, innerR, Math.PI * 2 - gapAngle / 2, gapAngle / 2, true);

  const lugAngle2 = gapAngle / 2;
  const lx2 = Math.cos(lugAngle2) * lugDist;
  const ly2 = Math.sin(lugAngle2) * lugDist;
  shape.lineTo(lx2, ly2);

  return new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
}

/**
 * Generates a fine stippled cast-iron noise texture for hammer-tone industrial enamel
 */
function createCastIronNoiseTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 512);
    const imgData = ctx.getImageData(0, 0, 512, 512);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 55;
      const v = Math.max(0, Math.min(255, 128 + n));
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

export function ExplodedPump3D({
  onSelectComponent,
  selectedComponentId,
  transparent = false,
}: ExplodedPump3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const partGroupsRef = useRef<Map<string, THREE.Group>>(new Map());

  // Kinematic animation references
  const shaftRotationGroupRef = useRef<THREE.Group | null>(null);
  const pistonPlungersRef = useRef<{ mesh: THREE.Group; baseOffset: number; phase: number }[]>([]);
  const shaftAngleRef = useRef(0);

  // Interactive UI state for the exploded-view controls
  const [explodePct, setExplodePct] = useState(65);
  const explodePctRef = useRef(65);
  // As a subject the machine has no controls, so it turns on its own.
  const [isSpinning, setIsSpinning] = useState(transparent);
  const isSpinningRef = useRef(transparent);
  const [showControls, setShowControls] = useState(true);
  const [showAllLabels, setShowAllLabels] = useState(true);
  const [screenCoords, setScreenCoords] = useState<Record<string, { x: number; y: number }>>({});

  const [webGlFailed, setWebGlFailed] = useState(false);

  // 3D Camera Orbit Drag state (Matches perspective in Photo 1)
  const isDraggingRef = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const cameraRotation = useRef({ theta: 0.64, phi: 0.36, radius: 42 });

  // Update part translations along the X axis based on explode percentage
  const updateExplodePositions = useCallback((pct: number) => {
    const factor = pct / 100;
    MECHANICAL_PARTS.forEach((part) => {
      const group = partGroupsRef.current.get(part.id);
      if (group) {
        const curX = part.assembledX + (part.explodeX - part.assembledX) * factor;
        group.position.x = curX;
      }
    });
  }, []);

  // Sync projected 2D screen positions for leader lines & callout badges
  const updateScreenCoordinates = useCallback(() => {
    if (!cameraRef.current || !containerRef.current) return;
    const camera = cameraRef.current;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    if (width === 0 || height === 0) return;

    const coords: Record<string, { x: number; y: number }> = {};
    CALLOUT_LABELS.forEach((label) => {
      const group = partGroupsRef.current.get(label.groupId);
      if (group) {
        const worldPos = new THREE.Vector3();
        group.getWorldPosition(worldPos);
        worldPos.y += label.offsetY;
        worldPos.x += label.offsetX;

        // Project 3D coordinate to normalized device coordinates (-1 to +1)
        worldPos.project(camera);

        // Map to 2D screen pixel space
        const x = ((worldPos.x + 1) * width) / 2;
        const y = ((-worldPos.y + 1) * height) / 2;
        if (x >= 20 && x <= width - 20 && y >= 50 && y <= height - 30) {
          coords[label.id] = { x, y };
        }
      }
    });
    setScreenCoords(coords);
  }, []);

  // Build Three.js scene, authentic CAD cutaways, and materials ONCE on mount
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    if (!transparent) scene.background = new THREE.Color('#FFFFFF');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 1000);
    cameraRef.current = camera;

    const updateCameraPos = () => {
      const { theta, phi, radius } = cameraRotation.current;
      camera.position.x = radius * Math.cos(phi) * Math.sin(theta);
      camera.position.y = radius * Math.sin(phi);
      camera.position.z = radius * Math.cos(phi) * Math.cos(theta);
      camera.lookAt(0, 0, 0);
    };
    updateCameraPos();

    // 2. High-Precision WebGL Renderer
    const small = window.innerWidth < 768;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !small,
        alpha: true,
        powerPreference: 'high-performance',
      });
      if (transparent) {
        renderer.setClearColor(0x000000, 0);
      }
    } catch (err) {
      console.warn('WebGL context creation failed; falling back to 3D image:', err);
      setTimeout(() => setWebGlFailed(true), 0);
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = !small;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 3. Studio Industrial Lighting (Eliminates harsh shadows, bright crisp specular highlights)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.4);
    mainLight.position.set(30, 45, 35);
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.75);
    fillLight.position.set(-30, 15, 20);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.85);
    rimLight.position.set(10, 30, -35);
    scene.add(rimLight);

    const groundReflectLight = new THREE.DirectionalLight(0xf1f5f9, 0.4);
    groundReflectLight.position.set(0, -25, 10);
    scene.add(groundReflectLight);

    // 4. Materials palette: cast iron, steel and bronze surface treatments
    const castIronBump = createCastIronNoiseTexture();

    const tealCastIron = new THREE.MeshStandardMaterial({
      color: 0x248b99, // Exact teal tone from Photo 1
      roughness: 0.36,
      metalness: 0.32,
      bumpMap: castIronBump,
      bumpScale: 0.05,
    });

    const machinedFace = new THREE.MeshStandardMaterial({
      color: 0xd6dde5,
      roughness: 0.22,
      metalness: 0.82,
    });

    const chromeSteel = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.1,
      metalness: 0.94,
    });

    const bronzeSlipper = new THREE.MeshStandardMaterial({
      color: 0xdfb43d,
      roughness: 0.24,
      metalness: 0.78,
    });

    const blackOxide = new THREE.MeshStandardMaterial({
      color: 0x1c2024,
      roughness: 0.48,
      metalness: 0.85,
    });

    const rubberSeal = new THREE.MeshStandardMaterial({
      color: 0x22262a,
      roughness: 0.75,
      metalness: 0.12,
    });

    const valveSpringMat = new THREE.MeshStandardMaterial({
      color: 0xdf9bc4,
      roughness: 0.35,
      metalness: 0.65,
    });

    // 5. Construct 3D Assembly Groups
    const groups = new Map<string, THREE.Group>();

    // [1] Shaft Retaining Ring (Snap Ring with eyelets)
    const gShaftRing = new THREE.Group();
    const shaftRingMesh = new THREE.Mesh(createSnapRingGeometry(2.4, 0.42, false), blackOxide);
    shaftRingMesh.rotation.y = Math.PI / 2;
    gShaftRing.add(shaftRingMesh);
    scene.add(gShaftRing);
    groups.set('shaft_retaining_ring', gShaftRing);

    // [2] Bearing Retaining Ring (Internal Circlip)
    const gBearingRing = new THREE.Group();
    const bearingRingMesh = new THREE.Mesh(createSnapRingGeometry(4.6, 0.48, true), blackOxide);
    bearingRingMesh.rotation.y = Math.PI / 2;
    gBearingRing.add(bearingRingMesh);
    scene.add(gBearingRing);
    groups.set('bearing_retaining_ring', gBearingRing);

    // [3] Front Radial Ball Bearing
    const gBallBearing = new THREE.Group();
    const outerRace = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 4.7, 1.1, 24, 1, true), chromeSteel);
    outerRace.rotation.z = Math.PI / 2;
    gBallBearing.add(outerRace);

    const innerRace = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 1.1, 24, 1, true), chromeSteel);
    innerRace.rotation.z = Math.PI / 2;
    gBallBearing.add(innerRace);

    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI * 2) / 10;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.58, 14, 14), chromeSteel);
      ball.position.set(0, Math.cos(a) * 3.6, Math.sin(a) * 3.6);
      gBallBearing.add(ball);
    }
    scene.add(gBallBearing);
    groups.set('ball_bearing', gBallBearing);

    // [4] High-Pressure Shaft Seal
    const gShaftSeal = new THREE.Group();
    const sealCase = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.75, 24), blackOxide);
    sealCase.rotation.z = Math.PI / 2;
    gShaftSeal.add(sealCase);

    const sealLip = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.78, 24, 1, true), rubberSeal);
    sealLip.rotation.z = Math.PI / 2;
    gShaftSeal.add(sealLip);
    scene.add(gShaftSeal);
    groups.set('shaft_seal', gShaftSeal);

    // [5] Tapered Roller Bearing
    const gTapered = new THREE.Group();
    const tapInner = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.1, 1.3, 24, 1, true), chromeSteel);
    tapInner.rotation.z = Math.PI / 2;
    gTapered.add(tapInner);

    const tapOuter = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 5.2, 1.3, 24, 1, true), chromeSteel);
    tapOuter.rotation.z = Math.PI / 2;
    gTapered.add(tapOuter);

    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI * 2) / 16;
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, 1.2, 16), chromeSteel);
      roller.rotation.z = Math.PI / 2;
      roller.position.set(0, Math.cos(a) * 3.9, Math.sin(a) * 3.9);
      gTapered.add(roller);
    }
    scene.add(gTapered);
    groups.set('tapered_roller_bearing', gTapered);

    // [6] Main Housing Body (Teal Enamel Cutaway Shell)
    const gHousing = new THREE.Group();

    /**
     * The housing is the one part that never moves.
     *
     * Eleven of the twelve MECHANICAL_PARTS translate on explode; `housing` is
     * the central reference anchor, and the spin animation drives only the
     * shaft, swashplate and pistons. So its pieces can be baked into one
     * geometry per material — 15 meshes become 3 draw calls — without affecting
     * the explode, the spin or part selection, which all address the GROUP.
     *
     * Falls back to adding the meshes individually if the merge is refused:
     * `mergeGeometries` returns null when attribute sets disagree, and a pump
     * that renders slightly slower beats a pump that does not render.
     */
    const bake = (meshes: THREE.Mesh[], material: THREE.Material) => {
      const geos = meshes.map((m) => {
        m.updateMatrix();
        return (m.geometry as THREE.BufferGeometry).clone().applyMatrix4(m.matrix);
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) {
        meshes.forEach((m) => gHousing.add(m));
        return;
      }
      meshes.forEach((m) => (m.geometry as THREE.BufferGeometry).dispose());
      gHousing.add(new THREE.Mesh(merged, material));
    };

    // Front Bearing Snout
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 5.4, 3.5, 24, 1, true), tealCastIron);
    snout.rotation.z = Math.PI / 2;
    snout.position.x = -3.2;

    // Snout Rim Chamfer
    const snoutRim = new THREE.Mesh(new THREE.TorusGeometry(4.8, 0.35, 16, 24), tealCastIron);
    snoutRim.rotation.y = Math.PI / 2;
    snoutRim.position.x = -4.9;

    // Snout Machined Face
    const snoutFace = new THREE.Mesh(new THREE.RingGeometry(2.6, 4.8, 24), machinedFace);
    snoutFace.rotation.y = -Math.PI / 2;
    snoutFace.position.x = -4.95;

    // Main Cylindrical Body Shell (Cutaway 240-deg arch so the inside swashplate is visible!)
    const bodyShell = new THREE.Mesh(
      new THREE.CylinderGeometry(6.6, 6.6, 5.2, 24, 1, true, Math.PI * 0.25, Math.PI * 1.5),
      tealCastIron
    );
    bodyShell.rotation.z = Math.PI / 2;
    bodyShell.position.x = 1.0;

    // Middle Flange Collar
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 1.1, 24), tealCastIron);
    collar.rotation.z = Math.PI / 2;
    collar.position.x = -1.2;

    // Rear Mounting Flange with Machined Face
    const rearFlange = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.2, 1.2, 24), tealCastIron);
    rearFlange.rotation.z = Math.PI / 2;
    rearFlange.position.x = 3.6;

    const rearMachinedFace = new THREE.Mesh(new THREE.RingGeometry(4.6, 8.18, 24), machinedFace);
    rearMachinedFace.rotation.y = Math.PI / 2;
    rearMachinedFace.position.x = 4.22;

    // Perimeter Bolt Counterbores
    const boltHoles: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI * 2) / 6;
      const holeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.3, 16), blackOxide);
      holeMesh.rotation.z = Math.PI / 2;
      holeMesh.position.set(3.6, Math.cos(a) * 7.1, Math.sin(a) * 7.1);
      boltHoles.push(holeMesh);
    }

    // Inlet Port Boss on Housing Top
    const inletBoss = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.2, 18), tealCastIron);
    inletBoss.position.set(0.5, 6.8, 0);

    const inletHole = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.3, 14), blackOxide);
    inletHole.position.set(0.5, 6.8, 0);

    bake([snout, snoutRim, bodyShell, collar, rearFlange, inletBoss], tealCastIron);
    bake([snoutFace, rearMachinedFace], machinedFace);
    bake([...boltHoles, inletHole], blackOxide);

    scene.add(gHousing);
    groups.set('housing', gHousing);

    // [7] Camshaft & Swashplate (Internal Rotating Group)
    const gCamshaft = new THREE.Group();
    shaftRotationGroupRef.current = gCamshaft;

    // Hardened Drive Shaft
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 18, 24), chromeSteel);
    shaft.rotation.z = Math.PI / 2;
    gCamshaft.add(shaft);

    // Front Keyway Slot
    const keyway = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.35, 0.4), blackOxide);
    keyway.position.set(-7.5, 1.3, 0);
    gCamshaft.add(keyway);

    // Integral Angled Wobble Swashplate Disc (14-degree angle tilt)
    const swashDiscGroup = new THREE.Group();
    swashDiscGroup.position.x = 0.6;
    swashDiscGroup.rotation.y = 0.25;

    const swashPlate = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 1.4, 24), chromeSteel);
    swashPlate.rotation.z = Math.PI / 2;
    swashDiscGroup.add(swashPlate);

    const wobbleFace = new THREE.Mesh(
      new THREE.CircleGeometry(5.15, 24),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.08, metalness: 0.98 })
    );
    wobbleFace.rotation.y = Math.PI / 2;
    wobbleFace.position.x = 0.72;
    swashDiscGroup.add(wobbleFace);

    gCamshaft.add(swashDiscGroup);
    scene.add(gCamshaft);
    groups.set('camshaft_swashplate', gCamshaft);

    // [8] Holddown Plate (Bronze Ring with 7 Slipper Shoes)
    const gHolddown = new THREE.Group();
    const holdPlateGroup = new THREE.Group();
    holdPlateGroup.position.x = 1.6;
    holdPlateGroup.rotation.y = 0.25;

    const holdRing = new THREE.Mesh(new THREE.RingGeometry(2.2, 4.9, 24), bronzeSlipper);
    holdRing.rotation.y = Math.PI / 2;
    holdPlateGroup.add(holdRing);

    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2) / 7;
      const shoe = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.42, 18), bronzeSlipper);
      shoe.rotation.z = Math.PI / 2;
      shoe.position.set(0.2, Math.cos(a) * 3.4, Math.sin(a) * 3.4);
      holdPlateGroup.add(shoe);
    }
    gHolddown.add(holdPlateGroup);
    scene.add(gHolddown);
    groups.set('holddown_plate', gHolddown);

    // [9] 7 Reciprocating Axial Pistons with Inlet Check Valves
    const gPistons = new THREE.Group();
    pistonPlungersRef.current = [];

    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2) / 7;
      const pGroup = new THREE.Group();

      const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 5.2, 18), chromeSteel);
      plunger.rotation.z = Math.PI / 2;
      pGroup.add(plunger);

      const shoe = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.38, 18), bronzeSlipper);
      shoe.rotation.z = Math.PI / 2;
      shoe.position.x = -2.7;
      pGroup.add(shoe);

      const ballJoint = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 16), chromeSteel);
      ballJoint.position.x = -2.4;
      pGroup.add(ballJoint);

      pGroup.position.set(0, Math.cos(a) * 3.4, Math.sin(a) * 3.4);
      gPistons.add(pGroup);

      pistonPlungersRef.current.push({
        mesh: pGroup,
        baseOffset: 0,
        phase: a,
      });
    }
    scene.add(gPistons);
    groups.set('piston_inlet_check_valve', gPistons);

    // [10] Cylinder Barrel Block
    const gBarrel = new THREE.Group();
    const barrelMesh = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 4.8, 24), tealCastIron);
    barrelMesh.rotation.z = Math.PI / 2;
    gBarrel.add(barrelMesh);

    const barrelFrontFace = new THREE.Mesh(new THREE.RingGeometry(1.5, 5.78, 24), machinedFace);
    barrelFrontFace.rotation.y = -Math.PI / 2;
    barrelFrontFace.position.x = -2.42;
    gBarrel.add(barrelFrontFace);

    const barrelRearFace = new THREE.Mesh(new THREE.RingGeometry(1.5, 5.78, 24), machinedFace);
    barrelRearFace.rotation.y = Math.PI / 2;
    barrelRearFace.position.x = 2.42;
    gBarrel.add(barrelRearFace);

    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2) / 7;
      const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 4.9, 18), blackOxide);
      bore.rotation.z = Math.PI / 2;
      bore.position.set(0, Math.cos(a) * 3.4, Math.sin(a) * 3.4);
      gBarrel.add(bore);
    }

    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI * 2) / 4 + Math.PI / 4;
      const boltGroup = new THREE.Group();
      const bHead = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.9, 16), blackOxide);
      bHead.rotation.z = Math.PI / 2;
      bHead.position.x = -2.85;
      boltGroup.add(bHead);

      const bShank = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 4.0, 12), blackOxide);
      bShank.rotation.z = Math.PI / 2;
      bShank.position.x = -0.5;
      boltGroup.add(bShank);

      boltGroup.position.set(0, Math.cos(a) * 4.9, Math.sin(a) * 4.9);
      gBarrel.add(boltGroup);
    }
    scene.add(gBarrel);
    groups.set('barrel', gBarrel);

    // [11] Cover Ball Check Valves
    const gCheckballs = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2) / 7;
      const valveGroup = new THREE.Group();

      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.52, 14, 14), chromeSteel);
      ball.position.x = -0.6;
      valveGroup.add(ball);

      const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.52, 1.4, 16), valveSpringMat);
      spring.rotation.z = Math.PI / 2;
      spring.position.x = 0.2;
      valveGroup.add(spring);

      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 16), blackOxide);
      seat.rotation.z = Math.PI / 2;
      seat.position.x = 0.9;
      valveGroup.add(seat);

      valveGroup.position.set(0, Math.cos(a) * 3.4, Math.sin(a) * 3.4);
      gCheckballs.add(valveGroup);
    }
    scene.add(gCheckballs);
    groups.set('cover_ball_check_valves', gCheckballs);

    // [12] Full Flow Cover & Hex Clamping Bolts
    const gCover = new THREE.Group();

    const coverMesh = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 4.4, 24), tealCastIron);
    coverMesh.rotation.z = Math.PI / 2;
    gCover.add(coverMesh);

    const coverFace = new THREE.Mesh(new THREE.RingGeometry(1.6, 6.38, 24), machinedFace);
    coverFace.rotation.y = -Math.PI / 2;
    coverFace.position.x = -2.22;
    gCover.add(coverFace);

    const plug = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), machinedFace);
    plug.position.x = 2.25;
    gCover.add(plug);

    const outletBoss = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 2.4, 18), tealCastIron);
    outletBoss.position.set(0, 6.8, 0);
    gCover.add(outletBoss);

    const outletBore = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.5, 14), blackOxide);
    outletBore.position.set(0, 6.8, 0);
    gCover.add(outletBore);

    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI * 2) / 6;
      const boltAssembly = new THREE.Group();

      const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 7.5, 16), blackOxide);
      shank.rotation.z = Math.PI / 2;
      shank.position.x = 2.0;
      boltAssembly.add(shank);

      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 18), blackOxide);
      head.rotation.z = Math.PI / 2;
      head.position.x = 6.2;
      boltAssembly.add(head);

      const hexSocket = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.5, 6), chromeSteel);
      hexSocket.rotation.z = Math.PI / 2;
      hexSocket.position.x = 7.12;
      boltAssembly.add(hexSocket);

      boltAssembly.position.set(0, Math.cos(a) * 5.2, Math.sin(a) * 5.2);
      gCover.add(boltAssembly);
    }

    scene.add(gCover);
    groups.set('full_flow_cover', gCover);

    partGroupsRef.current = groups;

    // Apply initial explode displacement on mount
    updateExplodePositions(explodePctRef.current);
    updateScreenCoordinates();

    // 6. Kinematic Animation Loop (Continuous 60FPS)
    let animId = 0;
    // 54 draw calls kept running while the worker read the SOP checklist below
    // the canvas, and in background tabs. Pure battery. HANDOFF §2 item 2.
    let onScreen = true;
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((es) => {
            onScreen = es.some((e) => e.isIntersecting);
          })
        : null;
    io?.observe(renderer.domElement);

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!onScreen || document.visibilityState !== 'visible') return;

      // INTERNAL MECHANICAL SPIN ANIMATION
      // When "Start Spin" is enabled, only the drive shaft, swashplate, and pistons move!
      if (isSpinningRef.current) {
        shaftAngleRef.current += 0.045;

        // 1. Rotate Camshaft & Swashplate around pump axis (X)
        if (shaftRotationGroupRef.current) {
          shaftRotationGroupRef.current.rotation.x = shaftAngleRef.current;
        }

        // 2. Rotate Holddown Plate with swashplate
        const holdGroup = partGroupsRef.current.get('holddown_plate');
        if (holdGroup) {
          holdGroup.rotation.x = shaftAngleRef.current;
        }

        // 3. Reciprocate the 7 Pistons in and out of the barrel cavities
        pistonPlungersRef.current.forEach((item) => {
          const theta = shaftAngleRef.current + item.phase;
          const stroke = Math.sin(theta) * 0.82;
          item.mesh.position.x = item.baseOffset + stroke;
        });
      }

      renderer.render(scene, camera);
      updateScreenCoordinates();
    };
    animate();

    // 7. Window Resize Handler
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w === 0 || h === 0) return;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
      updateScreenCoordinates();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
      io?.disconnect();

      /**
       * Walk the scene and release the GPU resources.
       *
       * `renderer.dispose()` alone frees the renderer's own state and nothing
       * else: every geometry, material and texture stays resident. With 54
       * meshes plus a generated CanvasTexture, moving between lessons a few
       * times leaked the lot. HANDOFF §2 item 3.
       */
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          for (const v of Object.values(m)) {
            if (v && typeof v === 'object' && 'isTexture' in v) {
              (v as THREE.Texture).dispose();
            }
          }
          m.dispose();
        }
      });
      renderer.dispose();
      // Hand the WebGL context back now. Browsers cap live contexts per
      // renderer (~16) and reclaim leaked ones only by GC, which is not prompt
      // for GPU memory — once the cap is hit the OLDEST contexts are killed.
      renderer.forceContextLoss();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [updateExplodePositions, updateScreenCoordinates]);

  // Update exploded translation whenever slider moves (Zero scene rebuild, 60fps translation)
  const handleExplodeChange = (val: number) => {
    setExplodePct(val);
    explodePctRef.current = val;
    updateExplodePositions(val);
    updateScreenCoordinates();
  };

  // Spin toggle handlers
  const handleStartSpin = () => {
    setIsSpinning(true);
    isSpinningRef.current = true;
  };

  const handleStopSpin = () => {
    setIsSpinning(false);
    isSpinningRef.current = false;
  };

  // Mouse drag handlers for 3D orbit (manual view rotation)
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    previousMousePosition.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !cameraRef.current) return;
    const deltaX = e.clientX - previousMousePosition.current.x;
    const deltaY = e.clientY - previousMousePosition.current.y;
    previousMousePosition.current = { x: e.clientX, y: e.clientY };

    cameraRotation.current.theta -= deltaX * 0.008;
    cameraRotation.current.phi = Math.max(
      -Math.PI / 2.2,
      Math.min(Math.PI / 2.2, cameraRotation.current.phi + deltaY * 0.008)
    );

    const { theta, phi, radius } = cameraRotation.current;
    cameraRef.current.position.x = radius * Math.cos(phi) * Math.sin(theta);
    cameraRef.current.position.y = radius * Math.sin(phi);
    cameraRef.current.position.z = radius * Math.cos(phi) * Math.cos(theta);
    cameraRef.current.lookAt(0, 0, 0);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Zoom with scroll wheel
  const handleWheel = (e: React.WheelEvent) => {
    if (!cameraRef.current) return;
    cameraRotation.current.radius = Math.max(
      18,
      Math.min(80, cameraRotation.current.radius + e.deltaY * 0.035)
    );
    const { theta, phi, radius } = cameraRotation.current;
    cameraRef.current.position.x = radius * Math.cos(phi) * Math.sin(theta);
    cameraRef.current.position.y = radius * Math.sin(phi);
    cameraRef.current.position.z = radius * Math.cos(phi) * Math.cos(theta);
    cameraRef.current.lookAt(0, 0, 0);
  };

  // Reset to default perspective
  const handleReset = () => {
    cameraRotation.current = { theta: 0.64, phi: 0.36, radius: 42 };
    if (cameraRef.current) {
      const { theta, phi, radius } = cameraRotation.current;
      cameraRef.current.position.x = radius * Math.cos(phi) * Math.sin(theta);
      cameraRef.current.position.y = radius * Math.sin(phi);
      cameraRef.current.position.z = radius * Math.cos(phi) * Math.cos(theta);
      cameraRef.current.lookAt(0, 0, 0);
    }
    handleExplodeChange(65);
    handleStopSpin();
  };

  const handleSelect = (callout: CalloutLabel) => {
    onSelectComponent?.(callout.id, callout.label);
  };

  return (
    <div
      className={
        transparent
          ? // A subject, not a panel: no plate, no border, no fixed height —
            // it fills whatever box the page gives it.
            'relative w-full h-full select-none'
          : 'relative w-full h-[580px] sm:h-[640px] bg-white rounded-2xl overflow-hidden border border-slate-300 shadow-sm select-none'
      }
    >
      {/* -------------------------------------------------------------
         TOP APP BAR (Hidden when embedded as hero subject)
         ------------------------------------------------------------- */}
      {!transparent && (
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-[#334155]/90 backdrop-blur-xs text-white border-b border-slate-600">
          <button
            type="button"
            className="rounded bg-[#2563EB] hover:bg-blue-600 px-3 py-1 text-xs font-bold shadow-xs transition-all"
          >
            Settings
          </button>

          <div className="flex items-center gap-2">
            <span className="rounded bg-teal-600 px-4 py-1 text-xs font-bold tracking-wide">
              Back to Session
            </span>
            <div className="size-6 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold">
              DP
            </div>
          </div>

          <button
            type="button"
            className="rounded bg-[#2563EB] hover:bg-blue-600 px-3 py-1 text-xs font-bold shadow-xs transition-all"
          >
            Your Account
          </button>
        </div>
      )}

      {/* -------------------------------------------------------------
         3D WEBGL VIEWPORT (Three.js Canvas) or Graceful 3D Fallback
         ------------------------------------------------------------- */}
      {webGlFailed ? (
        <div className="w-full h-full flex items-center justify-center pointer-events-none select-none">
          <img
            src="/twin/poster.webp"
            alt="Axial-Piston Pump 3D Cutaway"
            className="w-full h-full object-contain filter drop-shadow-lg"
          />
        </div>
      ) : (
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        />
      )}

      {/* -------------------------------------------------------------
         LEFT HUD: INTERACTION CONTROLS INSTRUCTIONS
         ------------------------------------------------------------- */}
      {!transparent && showControls && (
        <div className="pointer-events-none absolute top-16 left-6 z-10 text-[11px] font-medium text-slate-700 space-y-0.5 leading-snug bg-white/75 p-2 rounded-lg backdrop-blur-2xs border border-slate-200">
          <div><span className="font-bold">Zoom:</span> Scroll Mouse Wheel</div>
          <div><span className="font-bold">Rotate:</span> Left Mouse Drag</div>
          <div><span className="font-bold">Pan:</span> Right Mouse Drag</div>
          <div><span className="font-bold">Labels:</span> Click or Tap For Details</div>
        </div>
      )}

      {/* -------------------------------------------------------------
         FLOATING 3D CALLOUT LABELS & LEADER LINES (All Labels Toggle)
         ------------------------------------------------------------- */}
      {!transparent && showAllLabels && (
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          <svg className="w-full h-full">
            {CALLOUT_LABELS.map((callout) => {
              const pt = screenCoords[callout.id];
              if (!pt) return null;

              const leaderTargetY = callout.offsetY > 0 ? pt.y + 25 : pt.y - 25;

              return (
                <g key={callout.id}>
                  {/* Leader Line */}
                  <line
                    x1={pt.x}
                    y1={pt.y}
                    x2={pt.x}
                    y2={leaderTargetY}
                    stroke="#1E293B"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <circle cx={pt.x} cy={pt.y} r="2.5" fill="#1E293B" />
                </g>
              );
            })}
          </svg>

          {/* HTML Badge Overlays for Click Targets */}
          {CALLOUT_LABELS.map((callout) => {
            const pt = screenCoords[callout.id];
            if (!pt) return null;

            const isSelected = selectedComponentId === callout.id;
            const topY = callout.offsetY > 0 ? pt.y + 25 : pt.y - 45;

            return (
              <button
                key={callout.id}
                type="button"
                onClick={() => handleSelect(callout)}
                style={{
                  left: `${pt.x}px`,
                  top: `${topY}px`,
                  transform: 'translateX(-50%)',
                }}
                className={`pointer-events-auto absolute rounded-md border px-2.5 py-1 text-[10px] font-bold shadow-sm transition-all whitespace-nowrap ${
                  isSelected
                    ? 'bg-cyan-500 text-white border-cyan-600 ring-2 ring-cyan-300'
                    : 'bg-white/95 text-slate-900 border-slate-400 hover:bg-slate-100 hover:border-slate-600'
                }`}
              >
                {callout.label}
              </button>
            );
          })}
        </div>
      )}

      {/* -------------------------------------------------------------
         RIGHT CONTROL PANEL (Exact Match to Reference Screenshot)
         ------------------------------------------------------------- */}
      {!transparent && (
        <div className="absolute top-20 right-5 z-20 w-44 rounded-2xl bg-[#2D5DA7] p-4 text-white shadow-xl border border-blue-400/40">
          {/* Explode View Slider */}
          <div className="mb-3.5">
            <label className="block text-center text-xs font-bold text-white mb-1.5">
              Explode View
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={explodePct}
              onChange={(e) => handleExplodeChange(Number(e.target.value))}
              className="w-full h-2 bg-blue-900/60 rounded-lg appearance-none cursor-pointer accent-white"
            />
          </div>

          {/* Action Buttons */}
          <div className="space-y-1.5 mb-3.5">
            <button
              type="button"
              onClick={handleStartSpin}
              className={`w-full rounded-lg py-1.5 text-xs font-bold shadow-xs transition-colors ${
                isSpinning ? 'bg-emerald-400 text-slate-900 ring-2 ring-emerald-200' : 'bg-white/95 hover:bg-white text-slate-900'
              }`}
            >
              Start Spin
            </button>

            <button
              type="button"
              onClick={handleStopSpin}
              className="w-full rounded-lg bg-white/95 hover:bg-white text-slate-900 py-1.5 text-xs font-bold shadow-xs transition-colors"
            >
              Stop Spin
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="w-full rounded-lg bg-white/95 hover:bg-white text-slate-900 py-1.5 text-xs font-bold shadow-xs transition-colors"
            >
              Reset
            </button>
          </div>

          {/* Toggle Switches */}
          <div className="space-y-2 border-t border-blue-400/40 pt-3">
            {/* Controls Toggle */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowControls(!showControls)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  showControls ? 'bg-emerald-400' : 'bg-blue-950/60'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    showControls ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-xs font-bold text-white">Controls</span>
            </div>

            {/* All Labels Toggle */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowAllLabels(!showAllLabels)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  showAllLabels ? 'bg-emerald-400' : 'bg-blue-950/60'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    showAllLabels ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-xs font-bold text-white">All Labels</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
