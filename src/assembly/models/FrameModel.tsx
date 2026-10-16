// Khung xe: tấm dọc giữa hai bánh + cầu nối phía trên + càng giữ trục bánh.
import type { VehicleFrame } from '@/shared/types';
import { CATALOG_BY_ID } from '@/shared/catalog';
import { FRAME_THICKNESS, WHEEL_ITEM_ID, WHEEL_RADIUS } from '../design';

const FRAME_LOOK: Record<VehicleFrame['material'], { color: string; metal: number; rough: number; opacity?: number }> = {
  mica: { color: '#bae6fd', metal: 0, rough: 0.1, opacity: 0.55 },
  pla: { color: '#fb923c', metal: 0, rough: 0.75 },
  aluminum: { color: '#cbd5e1', metal: 0.9, rough: 0.3 },
  carton: { color: '#b08455', metal: 0, rough: 0.95 },
};

export function FrameModel({ frame, opacity }: { frame: VehicleFrame; opacity?: number }) {
  const look = FRAME_LOOK[frame.material];
  const r = WHEEL_RADIUS;
  const wheelW = CATALOG_BY_ID[WHEEL_ITEM_ID].size[2];
  const half = frame.wheelbase / 2;
  const t = FRAME_THICKNESS;
  const top = r + frame.height;
  const gap = 0.004;
  const op = opacity ?? look.opacity;

  const mat = (
    <meshStandardMaterial
      color={look.color}
      metalness={look.metal}
      roughness={look.rough}
      transparent={op !== undefined}
      opacity={op ?? 1}
      depthWrite={op === undefined}
    />
  );

  // tấm giữa hai bánh
  const innerLen = Math.max(0.01, 2 * (half - r - gap));
  const innerBottom = r - 0.012;
  // cầu nối phía trên bánh (nếu khung đủ cao)
  const bridgeBottom = 2 * r + gap;
  const hasBridge = top - bridgeBottom > 0.006;
  const bridgeLen = frame.wheelbase + 0.02;
  // càng bánh: 2 nhánh mỗi bên bánh
  const forkZ = wheelW / 2 + 0.003;
  const forkTop = hasBridge ? bridgeBottom + 0.004 : top;
  const forkLen = forkTop - r + 0.006;

  return (
    <group>
      <mesh position={[0, (innerBottom + top) / 2, 0]}>
        <boxGeometry args={[innerLen, top - innerBottom, t]} />
        {mat}
      </mesh>
      {hasBridge && (
        <mesh position={[0, (bridgeBottom + top) / 2, 0]}>
          <boxGeometry args={[bridgeLen, top - bridgeBottom, t]} />
          {mat}
        </mesh>
      )}
      {[-half, half].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          {[-forkZ, forkZ].map((z) => (
            <mesh key={z} position={[0, r - 0.006 + forkLen / 2, z]}>
              <boxGeometry args={[0.01, forkLen, t]} />
              {mat}
            </mesh>
          ))}
          {/* nối hai nhánh càng ở đỉnh */}
          <mesh position={[0, forkTop + 0.0015, 0]}>
            <boxGeometry args={[0.01, t, forkZ * 2 + t]} />
            {mat}
          </mesh>
          {/* trục bánh */}
          <mesh position={[0, r, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.002, 0.002, forkZ * 2 + 0.006, 12]} />
            <meshStandardMaterial color="#e2e8f0" metalness={1} roughness={0.2} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
