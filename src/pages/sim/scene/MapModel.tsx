// Vẽ sa hình từ hình học của lõi mô phỏng (buildMapGeometry) — cùng số đo với vật lý.
import { memo, useMemo, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, Group, Quaternion, Vector3 } from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import type { SimSnapshot } from '@/shared/types';
import { seesawQuat, type BoxGeom, type MapGeometry } from '@/sim';

function hull(points: number[]): BufferGeometry {
  const v: Vector3[] = [];
  for (let i = 0; i + 2 < points.length; i += 3) v.push(new Vector3(points[i], points[i + 1], points[i + 2]));
  return new ConvexGeometry(v);
}

function Box({ g, color, roughness = 0.9 }: { g: BoxGeom; color: string; roughness?: number }) {
  return (
    <mesh position={g.center} quaternion={g.quaternion} receiveShadow castShadow={false}>
      <boxGeometry args={g.size} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}

export interface MapModelProps {
  map: MapGeometry;
  /** Snapshot mới nhất (đọc trong useFrame để đặt ván cầu bập bênh). */
  snapRef: RefObject<SimSnapshot | null>;
}

export const MapModel = memo(function MapModel({ map, snapRef }: MapModelProps) {
  const c = map.colors;
  const rocks = useMemo(() => map.rocks.map((r) => ({ r, geom: hull(r.points) })), [map]);
  const seesawGeom = useMemo(() => (map.seesaw ? hull(map.seesaw.points) : null), [map]);
  return (
    <group>
      <Box g={map.floor} color={c.floor} />
      {map.walls.map((w, i) => (
        <Box key={i} g={w} color={c.wall} roughness={0.6} />
      ))}
      {map.lines.map((l, i) => (
        <Box key={i} g={l} color={l.kind === 'finish' ? '#111827' : c.line} />
      ))}
      {rocks.map(({ r, geom }, i) => (
        <mesh key={i} geometry={geom} position={r.position} quaternion={r.quaternion} castShadow>
          <meshStandardMaterial color={c.rock} roughness={1} flatShading />
        </mesh>
      ))}
      {map.seesaw && seesawGeom && <Seesaw map={map} geom={seesawGeom} snapRef={snapRef} />}
      {map.checkpoints.map((cp) => (
        <mesh key={cp.id} position={[cp.position[0], 0.002, cp.position[2]]} rotation={[-Math.PI / 2, 0, -cp.heading]}>
          <planeGeometry args={[0.02, cp.width]} />
          <meshBasicMaterial color="#f97316" transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  );
});

function Seesaw({ map, geom, snapRef }: { map: MapGeometry; geom: BufferGeometry; snapRef: RefObject<SimSnapshot | null> }) {
  const s = map.seesaw!;
  const initial = useMemo(() => seesawQuat(s, s.initialTiltDeg), [s]);
  const ref = useMemo(() => ({ current: null as Group | null }), []);
  const q = useMemo(() => new Quaternion(), []);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const pose = snapRef.current?.dynamic.find((d) => d.id === 'seesaw');
    if (pose) {
      g.position.set(...pose.position);
      g.quaternion.copy(q.set(...pose.quaternion));
    } else {
      g.position.set(...s.pivot);
      g.quaternion.copy(q.set(...initial));
    }
  });
  return (
    <group ref={(g) => (ref.current = g)}>
      <mesh geometry={geom} castShadow receiveShadow>
        <meshStandardMaterial color={map.colors.bridge} roughness={0.8} />
      </mesh>
    </group>
  );
}
