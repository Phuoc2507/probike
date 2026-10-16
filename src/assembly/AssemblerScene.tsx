// Cảnh 3D của trình lắp ráp: xe, lưới, hộp giới hạn kích thước, trọng tâm, gizmo di chuyển/xoay.
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, Html, OrbitControls, TransformControls } from '@react-three/drei';
import { BoxGeometry, EdgesGeometry, Plane, Raycaster, Vector2, Vector3, type Object3D } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Vec3, VehicleDesign } from '@/shared/types';
import { VehicleModel } from './VehicleModel';
import { GRID_STEP, LIMITS, ROTATE_STEP_DEG, WHEEL_RADIUS, round } from './design';
import { designBounds } from './rules';

export type GizmoMode = 'translate' | 'rotate';
export type ViewPreset = 'iso' | 'side' | 'top' | 'front';

/** Hàm đổi toạ độ chuột màn hình → điểm 3D trên mặt phẳng gắn linh kiện. */
export type DropProjector = (clientX: number, clientY: number) => { point: Vec3; facing: 'side' | 'top' | 'front'; sign: number } | null;

const TARGET: Vec3 = [0, 0.09, 0];
const VIEWS: Record<ViewPreset, Vec3> = {
  iso: [0.36, 0.28, 0.48],
  side: [0, 0.1, 0.6],
  top: [0, 0.65, 0.001],
  front: [0.6, 0.1, 0],
};

export interface AssemblerSceneProps {
  design: VehicleDesign;
  selectedUid: string | null;
  problemUids: ReadonlySet<string>;
  centerOfMass: Vec3;
  showSensors: boolean;
  mode: GizmoMode;
  view: ViewPreset;
  viewNonce: number;
  readOnly?: boolean;
  remoteSelections?: Record<string, string>;
  /** uid không được kéo bằng gizmo (bánh xe đặt theo khung). */
  isLocked: (uid: string) => boolean;
  onSelect: (uid: string | null) => void;
  onMove: (uid: string, pose: { position: Vec3; rotationDeg: Vec3 }) => void;
  dropRef: MutableRefObject<DropProjector | null>;
}

export function AssemblerScene(props: AssemblerSceneProps) {
  return (
    <Canvas
      camera={{ position: VIEWS.iso, fov: 40, near: 0.005, far: 20 }}
      dpr={[1, 2]}
      onPointerMissed={(e) => { if (e.type === 'click') props.onSelect(null); }}
    >
      <color attach="background" args={['#eef2f7']} />
      <hemisphereLight args={['#ffffff', '#94a3b8', 1.1]} />
      <directionalLight position={[0.6, 1.2, 0.8]} intensity={1.6} />
      <directionalLight position={[-0.8, 0.6, -0.6]} intensity={0.5} />
      <SceneContent {...props} />
    </Canvas>
  );
}

function SceneContent({
  design, selectedUid, problemUids, centerOfMass, showSensors, mode, view, viewNonce, readOnly, remoteSelections,
  isLocked, onSelect, onMove, dropRef,
}: AssemblerSceneProps) {
  const objects = useRef(new Map<string, Object3D>());
  const [selectedObj, setSelectedObj] = useState<Object3D | null>(null);
  const draggingRef = useRef(false);
  const lastDragEnd = useRef(0);

  // gắn gizmo vào linh kiện đang chọn (sau mỗi lần vẽ lại)
  useEffect(() => {
    setSelectedObj(selectedUid ? objects.current.get(selectedUid) ?? null : null);
  }, [selectedUid, design]);

  const onPartObject = useMemo(
    () => (uid: string, obj: Object3D | null) => {
      if (obj) objects.current.set(uid, obj);
      else objects.current.delete(uid);
    },
    [],
  );
  const onPartClick = useMemo(
    () => (uid: string, e: { delta: number }) => {
      if (draggingRef.current || performance.now() - lastDragEnd.current < 200 || e.delta > 4) return;
      onSelect(uid);
    },
    [onSelect],
  );

  const emitMove = () => {
    if (!selectedObj || !selectedUid) return;
    const p = selectedObj.position, r = selectedObj.rotation;
    const d = 180 / Math.PI;
    if (![p.x, p.y, p.z, r.x, r.y, r.z].every(Number.isFinite)) return;
    onMove(selectedUid, {
      position: [round(p.x), round(p.y), round(p.z)],
      rotationDeg: [round(r.x * d, 2), round(r.y * d, 2), round(r.z * d, 2)],
    });
  };

  // Gizmo sửa trực tiếp Object3D. Sau khi thả chuột, đặt lại object theo dữ liệu design (nguồn sự thật)
  // để nếu component cha không nhận onChange (chỉ xem, bị Yjs ghi đè...) thì hình 3D không lệch với props.
  const designRef = useRef(design);
  designRef.current = design;
  const [resync, setResync] = useState(0);
  useEffect(() => {
    if (resync === 0 || !selectedUid) return;
    const part = designRef.current.parts.find((p) => p.uid === selectedUid);
    const obj = objects.current.get(selectedUid);
    if (!part || !obj) return;
    const k = Math.PI / 180;
    obj.position.set(...part.position);
    obj.rotation.set(part.rotationDeg[0] * k, part.rotationDeg[1] * k, part.rotationDeg[2] * k);
  }, [resync, selectedUid, design]);

  const showGizmo = !!selectedObj && !!selectedUid && !readOnly && !isLocked(selectedUid);
  return (
    <>
      <CameraRig view={view} nonce={viewNonce} />
      <DropHelper dropRef={dropRef} design={design} />
      <Grid
        position={[0, -0.0005, 0]}
        args={[2, 2]}
        cellSize={0.01}
        sectionSize={0.05}
        cellColor="#cbd5e1"
        sectionColor="#94a3b8"
        fadeDistance={1.6}
        infiniteGrid
      />
      <VehicleModel
        design={design}
        showSensors={showSensors}
        selectedUid={selectedUid}
        errorUids={problemUids}
        remoteSelections={remoteSelections}
        onPartClick={onPartClick}
        onPartObject={onPartObject}
      />
      <LimitBox design={design} />
      <CenterOfMassMarker position={centerOfMass} />
      {showGizmo && (
        <TransformControls
          object={selectedObj!}
          mode={mode}
          space={mode === 'rotate' ? 'local' : 'world'}
          translationSnap={GRID_STEP}
          rotationSnap={(ROTATE_STEP_DEG * Math.PI) / 180}
          size={1}
          onMouseDown={() => { draggingRef.current = true; }}
          onMouseUp={() => {
            draggingRef.current = false;
            lastDragEnd.current = performance.now();
            emitMove();
            setResync((n) => n + 1);
          }}
          onObjectChange={emitMove}
        />
      )}
      <OrbitControls makeDefault target={TARGET} minDistance={0.12} maxDistance={2.5} />
    </>
  );
}

function CameraRig({ view, nonce }: { view: ViewPreset; nonce: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  useEffect(() => {
    if (nonce === 0) return;
    camera.position.set(...VIEWS[view]);
    controls?.target.set(...TARGET);
    controls?.update();
  }, [view, nonce, camera, controls]);
  return null;
}

/** Cung cấp hàm chiếu điểm thả (kéo linh kiện từ kho vào cảnh). */
function DropHelper({ dropRef, design }: { dropRef: MutableRefObject<DropProjector | null>; design: VehicleDesign }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const raycaster = new Raycaster();
    dropRef.current = (clientX, clientY) => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const dir = new Vector3();
      camera.getWorldDirection(dir);
      const ax = Math.abs(dir.x), ay = Math.abs(dir.y), az = Math.abs(dir.z);
      let plane: Plane, facing: 'side' | 'top' | 'front', sign: number;
      if (az >= ax && az >= ay) {
        plane = new Plane(new Vector3(0, 0, 1), 0); // mặt bên thân xe
        facing = 'side';
        sign = camera.position.z >= 0 ? 1 : -1;
      } else if (ay >= ax) {
        const top = WHEEL_RADIUS + design.frame.height;
        plane = new Plane(new Vector3(0, 1, 0), -top); // mặt trên khung
        facing = 'top';
        sign = 1;
      } else {
        plane = new Plane(new Vector3(1, 0, 0), 0);
        facing = 'front';
        sign = camera.position.x >= 0 ? 1 : -1;
      }
      const hit = new Vector3();
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      return { point: [hit.x, hit.y, hit.z], facing, sign };
    };
    return () => { dropRef.current = null; };
  }, [camera, gl, dropRef, design.frame.height]);
  return null;
}

/** Hộp giới hạn 35 × 30 × 15 cm bao quanh xe: xanh khi vừa, đỏ khi vượt. */
function LimitBox({ design }: { design: VehicleDesign }) {
  const b = designBounds(design);
  const fits =
    b.max[0] - b.min[0] <= LIMITS.lengthM + 5e-4 &&
    b.max[1] - Math.min(0, b.min[1]) <= LIMITS.heightM + 5e-4 &&
    b.max[2] - b.min[2] <= LIMITS.widthM + 5e-4;
  const geom = useMemo(() => new EdgesGeometry(new BoxGeometry(LIMITS.lengthM, LIMITS.heightM, LIMITS.widthM)), []);
  const cx = (b.min[0] + b.max[0]) / 2;
  const cz = (b.min[2] + b.max[2]) / 2;
  return (
    <lineSegments geometry={geom} position={[cx, LIMITS.heightM / 2, cz]} raycast={() => null}>
      <lineBasicMaterial color={fits ? '#16a34a' : '#dc2626'} transparent opacity={0.55} />
    </lineSegments>
  );
}


function CenterOfMassMarker({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <mesh raycast={() => null} renderOrder={10}>
        <sphereGeometry args={[0.006, 16, 12]} />
        <meshBasicMaterial color="#facc15" depthTest={false} transparent />
      </mesh>
      <mesh raycast={() => null} renderOrder={11}>
        <sphereGeometry args={[0.0075, 16, 12]} />
        <meshBasicMaterial color="#0f172a" wireframe depthTest={false} transparent />
      </mesh>
      <Html position={[0, 0.014, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap rounded bg-ink/80 px-1.5 py-0.5 text-[10px] font-semibold text-white">Trọng tâm</div>
      </Html>
    </group>
  );
}
