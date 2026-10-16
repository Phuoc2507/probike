// Mô hình 3D đơn giản nhưng nhận ra được cho từng linh kiện.
// Mỗi mô hình nằm gọn trong hộp `item.size`, tâm ở gốc, theo hệ trục cục bộ của linh kiện:
// cảm biến nhìn theo +x, trục động cơ hướng +x, trục bánh xe theo z, trục bánh đà theo x.
import { forwardRef, type ReactNode } from 'react';
import type { Group } from 'three';
import type { CatalogItem, Vec3 } from '@/shared/types';

type Axis = 'x' | 'y' | 'z';

const ROT_FOR_AXIS: Record<Axis, Vec3> = {
  y: [0, 0, 0],
  x: [0, 0, Math.PI / 2],
  z: [Math.PI / 2, 0, 0],
};

interface MatProps { color: string; metal?: number; rough?: number; opacity?: number; emissive?: string }

function Mat({ color, metal = 0, rough = 0.6, opacity, emissive }: MatProps) {
  return (
    <meshStandardMaterial
      color={color}
      metalness={metal}
      roughness={rough}
      transparent={opacity !== undefined}
      opacity={opacity ?? 1}
      emissive={emissive ?? '#000000'}
      emissiveIntensity={emissive ? 0.6 : 0}
    />
  );
}

function Box({ size, pos = [0, 0, 0], rot, children, ...mat }: { size: Vec3; pos?: Vec3; rot?: Vec3; children?: ReactNode } & MatProps) {
  return (
    <mesh position={pos} rotation={rot}>
      <boxGeometry args={size} />
      <Mat {...mat} />
      {children}
    </mesh>
  );
}

function Cyl({ r, r2, len, axis = 'y', pos = [0, 0, 0], seg = 24, ...mat }: { r: number; r2?: number; len: number; axis?: Axis; pos?: Vec3; seg?: number } & MatProps) {
  return (
    <mesh position={pos} rotation={ROT_FOR_AXIS[axis]}>
      <cylinderGeometry args={[r2 ?? r, r, len, seg]} />
      <Mat {...mat} />
    </mesh>
  );
}

/** Hàng chân header vàng dọc theo x. */
function Pins({ len, y, z, count }: { len: number; y: number; z: number; count: number }) {
  const step = len / count;
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <Box key={i} size={[0.0012, 0.003, 0.0012]} pos={[-len / 2 + step * (i + 0.5), y, z]} color="#d4a017" metal={0.8} rough={0.3} />
      ))}
    </>
  );
}

/** Tấm mạch in (PCB) nằm ngang. */
function Pcb({ size, color, pos }: { size: Vec3; color: string; pos?: Vec3 }) {
  return <Box size={size} pos={pos} color={color} rough={0.5} />;
}

// ---------------------------------------------------------------- từng loại

function WheelModel({ item }: { item: CatalogItem }) {
  const r = item.wheel?.radius ?? item.size[1] / 2;
  const w = item.wheel?.width ?? item.size[2];
  return (
    <group>
      <Cyl r={r} len={w} axis="z" color="#1f2937" rough={0.9} seg={40} />
      <Cyl r={r * 0.62} len={w * 1.04} axis="z" color="#cbd5e1" metal={0.6} rough={0.35} seg={32} />
      {/* nan hoa */}
      {[0, 1, 2, 3, 4].map((i) => (
        <Box key={i} size={[r * 1.15, r * 0.12, w * 1.06]} rot={[0, 0, (i * Math.PI) / 5]} color="#64748b" metal={0.5} />
      ))}
      <Cyl r={r * 0.14} len={w * 1.25} axis="z" color="#94a3b8" metal={0.8} rough={0.3} />
      {/* vạch trắng để thấy bánh quay */}
      <Box size={[r * 0.08, r * 0.4, w * 1.08]} pos={[0, r * 0.78, 0]} color="#f8fafc" />
    </group>
  );
}

function ControllerModel({ item }: { item: CatalogItem }) {
  const [x, y, z] = item.size;
  const board = item.id === 'esp32' ? '#111827' : item.id === 'stm32_bluepill' ? '#1d4ed8' : '#0e7490';
  const t = Math.min(0.0016, y * 0.3);
  return (
    <group>
      <Pcb size={[x, t, z]} color={board} pos={[0, -y / 2 + t / 2 + 0.001, 0]} />
      {item.id === 'esp32' ? (
        <Box size={[x * 0.35, y * 0.35, z * 0.6]} pos={[x * 0.25, -y / 2 + t + y * 0.18, 0]} color="#cbd5e1" metal={0.9} rough={0.25} />
      ) : (
        <Box size={[x * 0.2, y * 0.25, z * 0.4]} pos={[0, -y / 2 + t + y * 0.12, 0]} color="#0f172a" />
      )}
      {/* cổng USB */}
      <Box size={[x * 0.12, y * 0.3, z * 0.35]} pos={[-x / 2 + x * 0.06, -y / 2 + t + y * 0.15, 0]} color="#e5e7eb" metal={0.9} rough={0.3} />
      <Box size={[0.002, 0.002, 0.002]} pos={[x * 0.1, -y / 2 + t + 0.001, z * 0.3]} color="#22c55e" emissive="#22c55e" />
      <Pins len={x * 0.9} y={-y / 2 + t + 0.0015} z={z / 2 - 0.0015} count={15} />
      <Pins len={x * 0.9} y={-y / 2 + t + 0.0015} z={-z / 2 + 0.0015} count={15} />
    </group>
  );
}

function ImuModel({ item }: { item: CatalogItem }) {
  const [x, y, z] = item.size;
  const color = item.id === 'bno055' ? '#7c3aed' : '#1e40af';
  return (
    <group>
      <Pcb size={[x, y * 0.5, z]} color={color} pos={[0, -y / 4, 0]} />
      <Box size={[x * 0.25, y * 0.5, z * 0.3]} pos={[0, y / 4, 0]} color="#0f172a" />
      {/* mũi tên trục x in trên mạch */}
      <Box size={[x * 0.3, y * 0.52, z * 0.06]} pos={[x * 0.3, -y / 4 + 0.0002, -z * 0.3]} color="#f8fafc" />
      <Pins len={x * 0.8} y={0} z={-z / 2 + 0.0012} count={8} />
    </group>
  );
}

function EncoderModel({ item }: { item: CatalogItem }) {
  const [x, y, z] = item.size;
  return (
    <group>
      <Pcb size={[x * 0.3, y, z]} color="#047857" pos={[-x * 0.35, 0, 0]} />
      <Cyl r={Math.min(y, z) * 0.45} len={x * 0.3} axis="x" pos={[x * 0.1, 0, 0]} color="#334155" metal={0.4} />
      <Box size={[x * 0.1, y * 0.25, z * 0.25]} pos={[-x * 0.15, y * 0.25, 0]} color="#0f172a" />
    </group>
  );
}

function UltrasonicModel({ item }: { item: CatalogItem }) {
  const [x, y, z] = item.size;
  const r = Math.min(y * 0.42, z * 0.2);
  return (
    <group>
      <Pcb size={[x * 0.12, y, z]} color="#1d4ed8" pos={[-x / 2 + x * 0.06, 0, 0]} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Cyl r={r} len={x * 0.85} axis="x" pos={[x * 0.07, 0, (s * z) / 4]} color="#d1d5db" metal={0.8} rough={0.3} />
          <Cyl r={r * 0.8} len={x * 0.86} axis="x" pos={[x * 0.075, 0, (s * z) / 4]} color="#475569" rough={0.95} />
        </group>
      ))}
      <Box size={[x * 0.2, y * 0.15, z * 0.12]} pos={[-x * 0.25, y * 0.35, 0]} color="#e5e7eb" metal={0.8} />
    </group>
  );
}

function TofModel({ item }: { item: CatalogItem }) {
  const [x, y, z] = item.size;
  return (
    <group>
      <Pcb size={[x * 0.5, y, z]} color="#7e22ce" pos={[-x / 4, 0, 0]} />
      <Box size={[x * 0.5, y * 0.25, z * 0.3]} pos={[x / 4, y * 0.15, 0]} color="#0f172a" />
      <Box size={[x * 0.52, y * 0.08, z * 0.08]} pos={[x / 4 + 0.0001, y * 0.15, 0]} color="#ef4444" emissive="#ef4444" />
      <Pins len={y * 0.8} y={-y / 2 + 0.0015} z={0} count={1} />
    </group>
  );
}

function SharpModel({ item }: { item: CatalogItem }) {
  const [x, y, z] = item.size;
  return (
    <group>
      <Box size={[x * 0.75, y * 0.8, z * 0.55]} pos={[-x * 0.1, 0, 0]} color="#111827" />
      <Box size={[x * 0.2, y * 0.35, z]} pos={[-x * 0.35, 0, 0]} color="#111827" />
      {[-1, 1].map((s) => (
        <Cyl key={s} r={y * 0.22} len={x * 0.3} axis="x" pos={[x * 0.35, 0, (s * z) / 7]} color="#7f1d1d" opacity={0.85} rough={0.1} />
      ))}
    </group>
  );
}

function ReflectModel({ item }: { item: CatalogItem }) {
  const [x, y, z] = item.size;
  return (
    <group>
      <Pcb size={[x, y * 0.4, z]} color="#1d4ed8" pos={[0, -y * 0.3, 0]} />
      {/* đầu dò ở +x: một LED xanh, một mắt đen */}
      <Box size={[x * 0.2, y * 0.6, z * 0.9]} pos={[x / 2 - x * 0.1, y * 0.2, 0]} color="#0f172a" />
      <Cyl r={z * 0.2} len={x * 0.08} axis="x" pos={[x / 2 + 0.0002, y * 0.2, z * 0.22]} color="#60a5fa" emissive="#3b82f6" />
      <Cyl r={z * 0.2} len={x * 0.08} axis="x" pos={[x / 2 + 0.0002, y * 0.2, -z * 0.22]} color="#020617" />
      <Box size={[x * 0.15, y * 0.4, z * 0.4]} pos={[-x * 0.15, y * 0.1, 0]} color="#2563eb" />
    </group>
  );
}

function LidarModel({ item, spin }: { item: CatalogItem; spin: number }) {
  const [x, y] = item.size;
  return (
    <group>
      <Cyl r={x / 2} len={y * 0.45} pos={[0, -y * 0.275, 0]} color="#111827" />
      <group rotation={[0, spin, 0]}>
        <Cyl r={x * 0.42} len={y * 0.5} pos={[0, y * 0.22, 0]} color="#1f2937" rough={0.3} />
        <Box size={[x * 0.1, y * 0.18, x * 0.25]} pos={[x * 0.4, y * 0.25, 0]} color="#ef4444" emissive="#b91c1c" />
      </group>
    </group>
  );
}

function DcMotorModel({ item, spin }: { item: CatalogItem; spin: number }) {
  const [x, y, z] = item.size;
  const r = Math.min(y, z) / 2;
  const isN20 = item.id === 'motor_n20';
  const isGa25 = item.id === 'motor_ga25';
  const bodyLen = isN20 ? x * 0.5 : isGa25 ? x * 0.55 : x * 0.88;
  const bodyX = -x / 2 + bodyLen / 2;
  return (
    <group>
      <Cyl r={r} len={bodyLen} axis="x" pos={[bodyX, 0, 0]} color="#cbd5e1" metal={0.85} rough={0.3} />
      {isN20 && <Box size={[x * 0.35, r * 2, r * 2]} pos={[x * 0.075, 0, 0]} color="#d4a017" metal={0.8} rough={0.35} />}
      {isGa25 && <Cyl r={r} len={x * 0.33} axis="x" pos={[x * 0.11, 0, 0]} color="#a8a29e" metal={0.7} />}
      {/* nắp sau + chân hàn */}
      <Cyl r={r * 0.95} len={x * 0.05} axis="x" pos={[-x / 2 + x * 0.025, 0, 0]} color="#1f2937" />
      <Box size={[0.002, r * 0.5, 0.002]} pos={[-x / 2, r * 0.5, r * 0.4]} color="#d4a017" metal={0.8} />
      <Box size={[0.002, r * 0.5, 0.002]} pos={[-x / 2, r * 0.5, -r * 0.4]} color="#d4a017" metal={0.8} />
      {/* trục */}
      <group position={[x / 2 - x * 0.06, 0, 0]} rotation={[spin, 0, 0]}>
        <Cyl r={r * 0.18} len={x * 0.12} axis="x" color="#e2e8f0" metal={1} rough={0.2} />
        <Box size={[x * 0.12, r * 0.05, r * 0.36]} color="#94a3b8" metal={1} />
      </group>
    </group>
  );
}

function TtMotorModel({ item }: { item: CatalogItem }) {
  const [x, y, z] = item.size;
  return (
    <group>
      <Box size={[x * 0.6, y, z]} pos={[x * 0.2, 0, 0]} color="#facc15" rough={0.5} />
      <Cyl r={y * 0.42} len={x * 0.4} axis="x" pos={[-x * 0.3, 0, 0]} color="#cbd5e1" metal={0.85} rough={0.3} />
      {/* trục ra hai bên (theo z) */}
      <Box size={[0.0055, 0.0037, z * 1.5]} pos={[x * 0.32, 0, 0]} color="#f8fafc" />
    </group>
  );
}

function BldcModel({ item, spin }: { item: CatalogItem; spin: number }) {
  const [x, y] = item.size;
  return (
    <group>
      <Box size={[x * 0.3, y, y]} pos={[-x * 0.35, 0, 0]} color="#166534" />
      <group rotation={[spin, 0, 0]}>
        <Cyl r={y / 2} len={x * 0.6} axis="x" pos={[x * 0.15, 0, 0]} color="#111827" metal={0.5} rough={0.4} />
        <Box size={[x * 0.62, y * 0.12, y * 0.12]} pos={[x * 0.15, y * 0.38, 0]} color="#ef4444" />
      </group>
    </group>
  );
}

function ServoModel({ item, spin }: { item: CatalogItem; spin: number }) {
  const [x, y, z] = item.size;
  const color = item.id === 'servo_mg90s' ? '#111827' : '#1d4ed8';
  return (
    <group>
      <Box size={[x, y * 0.75, z]} pos={[0, -y * 0.125, 0]} color={color} opacity={0.92} rough={0.3} />
      <Box size={[x * 1.35, y * 0.08, z]} pos={[0, y * 0.12, 0]} color={color} />
      <Cyl r={z * 0.3} len={y * 0.15} pos={[x * 0.2, y * 0.32, 0]} color="#e5e7eb" />
      <group position={[x * 0.2, y * 0.44, 0]} rotation={[0, spin, 0]}>
        <Box size={[x * 0.9, y * 0.06, z * 0.25]} color="#f8fafc" />
      </group>
    </group>
  );
}

function FlywheelModel({ item, spin }: { item: CatalogItem; spin: number }) {
  const [x, y] = item.size;
  const r = item.flywheel?.radius ?? y / 2;
  const color = item.id === 'flywheel_steel_100' ? '#64748b' : item.id === 'flywheel_brass_70' ? '#b8860b' : '#d1d5db';
  return (
    <group rotation={[spin, 0, 0]}>
      <Cyl r={r} len={x} axis="x" color={color} metal={0.9} rough={0.25} seg={48} />
      <Cyl r={r * 0.82} len={x * 1.02} axis="x" color={color} metal={0.7} rough={0.45} seg={48} />
      {/* lỗ giảm khối lượng + dấu màu để thấy quay */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i * Math.PI) / 3;
        return (
          <Cyl key={i} r={r * 0.14} len={x * 1.05} axis="x" pos={[0, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5]} color="#1e293b" />
        );
      })}
      <Box size={[x * 1.06, r * 0.18, r * 0.08]} pos={[0, r * 0.9, 0]} color="#f97316" />
      <Cyl r={r * 0.15} len={x * 1.6} axis="x" color="#475569" metal={1} />
    </group>
  );
}

function DriverModel({ item }: { item: CatalogItem }) {
  const [x, y, z] = item.size;
  if (item.id === 'l298n') {
    return (
      <group>
        <Pcb size={[x, y * 0.08, z]} color="#b91c1c" pos={[0, -y / 2 + y * 0.04, 0]} />
        <Box size={[x * 0.5, y * 0.85, z * 0.15]} pos={[0, y * 0.05, -z * 0.3]} color="#111827" metal={0.6} rough={0.4} />
        {[-1, 1].map((s) => (
          <Box key={s} size={[x * 0.2, y * 0.3, z * 0.2]} pos={[s * x * 0.38, -y * 0.25, z * 0.3]} color="#2563eb" />
        ))}
        <Cyl r={z * 0.1} len={y * 0.45} pos={[0, -y * 0.2, z * 0.25]} color="#0f172a" />
      </group>
    );
  }
  return (
    <group>
      <Pcb size={[x, y * 0.5, z]} color="#dc2626" pos={[0, -y / 4, 0]} />
      <Box size={[x * 0.35, y * 0.5, z * 0.3]} pos={[0, y / 4, 0]} color="#0f172a" />
      <Pins len={x * 0.9} y={0} z={z / 2 - 0.0012} count={8} />
      <Pins len={x * 0.9} y={0} z={-z / 2 + 0.0012} count={8} />
    </group>
  );
}

function BatteryModel({ item }: { item: CatalogItem }) {
  const [x, y, z] = item.size;
  if (item.id === 'lipo_2s_1000') {
    return (
      <group>
        <Box size={[x * 0.95, y, z]} pos={[x * 0.025, 0, 0]} color="#c0c7d1" metal={0.6} rough={0.4} />
        <Box size={[x * 0.6, y * 1.01, z * 0.7]} pos={[x * 0.05, 0, 0]} color="#facc15" rough={0.6} />
        <Box size={[x * 0.1, 0.002, 0.002]} pos={[-x / 2, y * 0.2, z * 0.1]} color="#dc2626" />
        <Box size={[x * 0.1, 0.002, 0.002]} pos={[-x / 2, y * 0.2, -z * 0.1]} color="#111827" />
      </group>
    );
  }
  const r = Math.min(y, z / 2) * 0.46;
  return (
    <group>
      <Box size={[x, y * 0.25, z]} pos={[0, -y / 2 + y * 0.125, 0]} color="#111827" />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Cyl r={r} len={x * 0.92} axis="x" pos={[0, 0, (s * z) / 4]} color={s > 0 ? '#16a34a' : '#2563eb'} rough={0.4} />
          <Cyl r={r * 0.4} len={x * 0.94} axis="x" pos={[0, 0, (s * z) / 4]} color="#e5e7eb" metal={0.9} />
        </group>
      ))}
    </group>
  );
}

function BuckModel({ item }: { item: CatalogItem }) {
  const [x, y, z] = item.size;
  const small = item.id === 'mini560';
  return (
    <group>
      <Pcb size={[x, y * 0.15, z]} color={small ? '#065f46' : '#1d4ed8'} pos={[0, -y / 2 + y * 0.075, 0]} />
      {!small && <Cyl r={z * 0.2} len={y * 0.8} pos={[x * 0.25, y * 0.05, 0]} color="#0f172a" />}
      {!small && <Box size={[x * 0.2, y * 0.4, z * 0.3]} pos={[-x * 0.25, -y * 0.15, z * 0.2]} color="#2563eb" />}
      <Box size={[x * 0.25, y * 0.35, z * 0.4]} pos={[0, -y * 0.15, -z * 0.15]} color="#334155" />
    </group>
  );
}

function SwitchModel({ item }: { item: CatalogItem }) {
  const [x, y, z] = item.size;
  return (
    <group>
      <Box size={[x, y * 0.7, z]} pos={[0, -y * 0.15, 0]} color="#111827" />
      <Box size={[x * 0.4, y * 0.4, z * 0.6]} pos={[x * 0.15, y * 0.3, 0]} rot={[0, 0, -0.35]} color="#dc2626" />
    </group>
  );
}

function StructureModel({ item }: { item: CatalogItem }) {
  const [x, y, z] = item.size;
  if (item.id === 'standoff_m3') {
    return (
      <group>
        <Cyl r={x / 2} len={y * 0.85} seg={6} color="#d4a017" metal={0.85} rough={0.3} />
        <Cyl r={x * 0.45} len={y * 0.15} pos={[0, y * 0.43, 0]} color="#94a3b8" metal={0.9} />
      </group>
    );
  }
  // giá chữ L in 3D
  return (
    <group>
      <Box size={[x, y * 0.2, z]} pos={[0, -y * 0.4, 0]} color="#f97316" rough={0.8} />
      <Box size={[x * 0.2, y, z]} pos={[-x * 0.4, 0, 0]} color="#f97316" rough={0.8} />
    </group>
  );
}

function GenericModel({ item }: { item: CatalogItem }) {
  return <Box size={item.size} color="#94a3b8" />;
}

export interface PartModelProps {
  item: CatalogItem;
  /** Góc quay (rad) của phần quay: bánh xe (quanh z), trục động cơ/bánh đà (quanh x), servo/lidar (quanh y). */
  spin?: number;
}

/** Mô hình 3D của một linh kiện, tâm ở gốc. */
export const PartModel = forwardRef<Group, PartModelProps>(function PartModel({ item, spin = 0 }, ref) {
  return <group ref={ref}>{renderPart(item, spin)}</group>;
});

function renderPart(item: CatalogItem, spin: number) {
  switch (item.category) {
    case 'wheel':
      return <group rotation={[0, 0, spin]}><WheelModel item={item} /></group>;
    case 'controller':
      return <ControllerModel item={item} />;
    case 'flywheel':
      return <FlywheelModel item={item} spin={spin} />;
    case 'driver':
      return <DriverModel item={item} />;
    case 'structure':
      return <StructureModel item={item} />;
    case 'power':
      if (item.battery) return <BatteryModel item={item} />;
      if (item.id === 'switch_power') return <SwitchModel item={item} />;
      return <BuckModel item={item} />;
    case 'motor':
      if (item.motor?.kind === 'servo') return <ServoModel item={item} spin={spin} />;
      if (item.id === 'motor_tt') return <TtMotorModel item={item} />;
      if (item.id === 'motor_rw_bldc') return <BldcModel item={item} spin={spin} />;
      return <DcMotorModel item={item} spin={spin} />;
    case 'sensor':
      switch (item.sensor?.kind) {
        case 'imu': return <ImuModel item={item} />;
        case 'encoder': return <EncoderModel item={item} />;
        case 'ultrasonic': return <UltrasonicModel item={item} />;
        case 'tof_laser': return <TofModel item={item} />;
        case 'ir_distance': return <SharpModel item={item} />;
        case 'ir_reflect': return <ReflectModel item={item} />;
        case 'lidar_360': return <LidarModel item={item} spin={spin} />;
      }
  }
  return <GenericModel item={item} />;
}
