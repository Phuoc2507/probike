// Hiển thị tia (laser, hồng ngoại) và nón (siêu âm) của cảm biến, theo trục +x cục bộ.
import { useMemo } from 'react';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { CatalogItem } from '@/shared/types';

/** Chiều dài tối đa vẽ trên màn hình (m) để không che hết cảnh. */
const MAX_DRAW = 0.6;

// Tia/nón chỉ để nhìn, không chặn chuột khi chọn linh kiện.
const noRaycast = () => null;

const COLORS = {
  ultrasonic: '#22d3ee',
  tof_laser: '#ef4444',
  ir_distance: '#f472b6',
  ir_reflect: '#a855f7',
  lidar_360: '#f97316',
} as const;

function Ray({ from, to, color }: { from: number; to: number; color: string }) {
  const geom = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([from, 0, 0, to, 0, 0], 3));
    return g;
  }, [from, to]);
  return (
    <group>
      <lineSegments geometry={geom} raycast={noRaycast}>
        <lineBasicMaterial color={color} transparent opacity={0.9} />
      </lineSegments>
      <mesh position={[to, 0, 0]} raycast={noRaycast}>
        <sphereGeometry args={[0.003, 10, 8]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}

function Cone({ length, fovDeg, color, opacity = 0.18 }: { length: number; fovDeg: number; color: string; opacity?: number }) {
  const radius = Math.tan(((fovDeg / 2) * Math.PI) / 180) * length;
  return (
    // ConeGeometry: đỉnh ở +y; xoay +90° quanh z để đỉnh nằm ở gốc và đáy hướng +x
    <mesh position={[length / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} raycast={noRaycast}>
      <coneGeometry args={[radius, length, 32, 1, true]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={2} />
    </mesh>
  );
}

/** Vẽ vùng đo của một cảm biến (gắn bên trong group của linh kiện). */
export function SensorViz({ item }: { item: CatalogItem }) {
  const s = item.sensor;
  if (!s) return null;
  const face = item.size[0] / 2;
  const maxR = Math.min(s.maxRange ?? MAX_DRAW, MAX_DRAW);
  const minR = s.minRange ?? 0;
  switch (s.kind) {
    case 'ultrasonic':
      return (
        <group position={[face, 0, 0]}>
          <Cone length={maxR} fovDeg={s.fovDeg ?? 15} color={COLORS.ultrasonic} />
        </group>
      );
    case 'tof_laser':
      return (
        <group position={[face, 0, 0]}>
          <Ray from={minR} to={maxR} color={COLORS.tof_laser} />
        </group>
      );
    case 'ir_distance':
      return (
        <group position={[face, 0, 0]}>
          <Ray from={minR} to={maxR} color={COLORS.ir_distance} />
          <Cone length={maxR} fovDeg={Math.max(s.fovDeg ?? 2, 2)} color={COLORS.ir_distance} opacity={0.12} />
        </group>
      );
    case 'ir_reflect':
      return (
        <group position={[face, 0, 0]}>
          <Ray from={0} to={s.maxRange ?? 0.015} color={COLORS.ir_reflect} />
        </group>
      );
    case 'lidar_360':
      return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, item.size[1] * 0.25, 0]} raycast={noRaycast}>
          <ringGeometry args={[item.size[0] / 2, maxR, 64]} />
          <meshBasicMaterial color={COLORS.lidar_360} transparent opacity={0.08} depthWrite={false} side={2} />
        </mesh>
      );
    default:
      return null;
  }
}
