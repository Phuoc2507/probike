// Khung nhìn 3D của giai đoạn Cân bằng / Sa hình: sa hình + xe (VehicleModel) đặt theo SimSnapshot.
// Snapshot đọc qua ref trong useFrame → không render lại React mỗi bước mô phỏng.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Group, Quaternion, Vector3 } from 'three';
import type { MapId, SimSnapshot, VehicleDesign } from '@/shared/types';
import { VehicleModel } from '@/assembly';
import { buildMapGeometry, type MapGeometry } from '@/sim';
import { MapModel } from './MapModel';

export interface SimViewportProps {
  design: VehicleDesign;
  mapId: MapId;
  seed: number;
  snapRef: RefObject<SimSnapshot | null>;
  /** Tăng mỗi khi bắt đầu lượt mới — đặt lại camera về sau xe. */
  resetKey?: number;
  className?: string;
}

export function SimViewport({ design, mapId, seed, snapRef, resetKey = 0, className = '' }: SimViewportProps) {
  const map = useMemo(() => buildMapGeometry(mapId, seed), [mapId, seed]);
  const [follow, setFollow] = useState(true);
  return (
    <div className={`relative overflow-hidden bg-gradient-to-b from-sky-100 to-slate-200 ${className}`}>
      <Canvas shadows dpr={[1, 1.75]} camera={{ fov: 45, near: 0.01, far: 50, position: [-0.6, 0.45, 0.6] }}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[2, 4, 1.5]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <hemisphereLight args={['#e0f2fe', '#475569', 0.35]} />
        <MapModel map={map} snapRef={snapRef} />
        <Bike design={design} map={map} snapRef={snapRef} />
        <CameraRig map={map} snapRef={snapRef} follow={follow} resetKey={`${resetKey}:${mapId}:${seed}`} />
      </Canvas>
      <div className="absolute right-2 top-2 flex gap-1 text-xs">
        <button
          type="button"
          onClick={() => setFollow((f) => !f)}
          className={`rounded-md border px-2 py-1 shadow-sm ${follow ? 'border-brand bg-brand text-white' : 'border-line bg-white/90 text-ink'}`}
          title="Camera di chuyển theo xe (vẫn kéo chuột để xoay được)"
        >
          {follow ? 'Đang bám xe' : 'Bám xe'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Xe

const qTmp = new Quaternion();
const qBike = new Quaternion();
const qRel = new Quaternion();

/** Góc quay quanh một trục cục bộ của quaternion tương đối (bỏ qua thành phần khác). */
function angleAbout(q: Quaternion, axis: 'x' | 'z'): number {
  return 2 * Math.atan2(axis === 'x' ? q.x : q.z, q.w);
}

function Bike({ design, map, snapRef }: { design: VehicleDesign; map: MapGeometry; snapRef: RefObject<SimSnapshot | null> }) {
  const group = useRef<Group>(null);
  const [spin, setSpin] = useState<Record<string, number>>({});
  const lastSpinAt = useRef(0);
  const discUids = useMemo(
    () => new Set(design.parts.filter((p) => p.itemId.startsWith('flywheel')).map((p) => p.uid)),
    [design],
  );

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const s = snapRef.current;
    if (!s) {
      // Chưa chạy: đặt xe đứng thẳng ở vị trí xuất phát
      g.position.set(...map.start.position);
      g.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), -map.start.heading);
      return;
    }
    g.position.set(...s.bike.position);
    qBike.set(...s.bike.quaternion);
    g.quaternion.copy(qBike);
    // Góc quay bánh/bánh đà cập nhật ~20 lần/giây (đủ để thấy chuyển động, ít render)
    const t = state.clock.elapsedTime;
    if (t - lastSpinAt.current < 0.05) return;
    lastSpinAt.current = t;
    const inv = qBike.clone().invert();
    const next: Record<string, number> = {};
    for (const p of s.parts) {
      qRel.copy(inv).multiply(qTmp.set(...p.quaternion));
      next[p.id] = angleAbout(qRel, discUids.has(p.id) ? 'x' : 'z');
    }
    setSpin(next);
  });

  return (
    <group ref={group}>
      <VehicleModel design={design} spin={spin} />
    </group>
  );
}

// ---------------------------------------------------------------- Camera

function CameraRig({
  map, snapRef, follow, resetKey,
}: { map: MapGeometry; snapRef: RefObject<SimSnapshot | null>; follow: boolean; resetKey: string }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const last = useRef(new Vector3());

  // Đặt camera phía sau-bên trái xe, nhìn về hướng đi
  useEffect(() => {
    const [x, , z] = map.start.position;
    const h = map.start.heading;
    const back = new Vector3(Math.cos(h), 0, Math.sin(h)).multiplyScalar(-0.75);
    const side = new Vector3(-Math.sin(h), 0, Math.cos(h)).multiplyScalar(-0.45);
    camera.position.set(x + back.x + side.x, 0.5, z + back.z + side.z);
    last.current.set(x, 0.08, z);
    controls.current?.target.set(x, 0.08, z);
    controls.current?.update();
  }, [resetKey, map, camera]);

  useFrame(() => {
    const s = snapRef.current;
    const c = controls.current;
    if (!s || !c) return;
    const p = new Vector3(s.bike.position[0], 0.08, s.bike.position[2]);
    if (follow) {
      // Dời camera và tâm xoay cùng độ dời của xe → người dùng vẫn xoay/thu phóng tự do
      const d = p.clone().sub(last.current);
      camera.position.add(d);
      c.target.add(d);
      c.update();
    }
    last.current.copy(p);
  });

  return <OrbitControls ref={controls} makeDefault enableDamping maxPolarAngle={Math.PI / 2 - 0.05} minDistance={0.15} maxDistance={8} />;
}
