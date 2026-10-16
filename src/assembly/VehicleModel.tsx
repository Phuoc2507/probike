// Mô hình 3D toàn xe từ VehicleDesign — dùng chung cho trình lắp ráp và trang mô phỏng.
// Gốc toạ độ = gốc xe (trung điểm hai điểm tiếp đất của bánh). Đặt trong <Canvas> của @react-three/fiber.
import { memo, useMemo, type ReactNode } from 'react';
import { BoxGeometry, EdgesGeometry, type Object3D } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { PlacedPart, Vec3, VehicleDesign } from '@/shared/types';
import { CATALOG_BY_ID } from '@/shared/catalog';
import { PartModel } from './models/PartModel';
import { FrameModel } from './models/FrameModel';
import { SensorViz } from './models/SensorViz';

const DEG = Math.PI / 180;

export interface VehicleModelProps {
  design: VehicleDesign;
  /** Vẽ tia/nón của cảm biến. */
  showSensors?: boolean;
  /** Góc quay (rad) theo uid: bánh xe quanh trục z, bánh đà/trục động cơ quanh x, servo quanh y. */
  spin?: Record<string, number>;
  /** Linh kiện đang chọn (viền cam). */
  selectedUid?: string | null;
  /** Linh kiện đang vi phạm luật (viền đỏ). */
  errorUids?: ReadonlySet<string>;
  /** Linh kiện đang được người khác trong đội chọn (viền theo màu người đó). */
  remoteSelections?: Record<string, string>;
  /** Bấm vào linh kiện. */
  onPartClick?: (uid: string, e: ThreeEvent<MouseEvent>) => void;
  /** Nhận Object3D của từng linh kiện (để gắn gizmo). */
  onPartObject?: (uid: string, obj: Object3D | null) => void;
  /** Làm mờ khung để dễ nhìn linh kiện bên trong. */
  frameOpacity?: number;
}

export const VehicleModel = memo(function VehicleModel({
  design, showSensors = false, spin, selectedUid, errorUids, remoteSelections, onPartClick, onPartObject, frameOpacity,
}: VehicleModelProps) {
  return (
    <group>
      <FrameModel frame={design.frame} opacity={frameOpacity} />
      {design.parts.map((p) => (
        <PlacedPartModel
          key={p.uid}
          part={p}
          spin={spin?.[p.uid] ?? 0}
          showSensor={showSensors}
          outline={
            p.uid === selectedUid ? '#f97316' : errorUids?.has(p.uid) ? '#ef4444' : remoteSelections?.[p.uid]
          }
          onClick={onPartClick}
          onObject={onPartObject}
        />
      ))}
    </group>
  );
});

interface PlacedPartModelProps {
  part: PlacedPart;
  spin: number;
  showSensor: boolean;
  outline?: string;
  onClick?: VehicleModelProps['onPartClick'];
  onObject?: VehicleModelProps['onPartObject'];
}

const PlacedPartModel = memo(function PlacedPartModel({ part, spin, showSensor, outline, onClick, onObject }: PlacedPartModelProps) {
  const item = CATALOG_BY_ID[part.itemId];
  const rotation = useMemo(() => part.rotationDeg.map((d) => d * DEG) as Vec3, [part.rotationDeg]);
  if (!item) return null;
  return (
    <group
      name={part.uid}
      position={part.position}
      rotation={rotation}
      ref={onObject ? (obj) => onObject(part.uid, obj) : undefined}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(part.uid, e); } : undefined}
    >
      <PartModel item={item} spin={spin} />
      {outline && <Outline size={item.size} color={outline} />}
      {showSensor && <SensorViz item={item} />}
    </group>
  );
});

function Outline({ size, color }: { size: Vec3; color: string }): ReactNode {
  const geom = useMemo(() => {
    const pad = 0.003;
    return new EdgesGeometry(new BoxGeometry(size[0] + pad, size[1] + pad, size[2] + pad));
  }, [size]);
  return (
    <lineSegments geometry={geom} raycast={() => null}>
      <lineBasicMaterial color={color} depthTest={false} transparent />
    </lineSegments>
  );
}
