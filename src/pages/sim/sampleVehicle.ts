// Xe mẫu của trang mô phỏng: cùng cấu hình với SAMPLE_DESIGN của lõi mô phỏng (ESP32, MPU6050, BLDC + đĩa thép,
// encoder bánh đà, N20 kéo bánh sau, pin 18650 ×2) nhưng dựng bằng API lắp ráp để qua được checkDesign
// (chân cắm hợp lệ, không chồng lấn). Bộ PID mẫu (samples.ts) đã kiểm chứng với xe này trong test.
import type { VehicleDesign } from '@/shared/types';
import { addPart, createEmptyDesign, setFrame, updatePart } from '@/assembly';

export function createSampleVehicle(): VehicleDesign {
  let d = setFrame(createEmptyDesign('Xe mẫu ProBike'), { wheelbase: 0.16, height: 0.12, material: 'mica' });
  const add = (itemId: string, name: string, position?: [number, number, number], pin?: string) => {
    const r = addPart(d, itemId, { name, position });
    d = pin ? updatePart(r.design, r.uid, { pin }) : r.design;
  };
  add('battery_18650x2', 'pin', [0, 0.05, 0]);
  add('motor_rw_bldc', 'banhDa', [-0.02, 0.12, 0], 'GPIO25');
  add('flywheel_steel_100', 'diaBanhDa');
  add('encoder_hall', 'encBanhDa', [-0.045, 0.12, 0], 'GPIO34');
  add('esp32', 'esp32', [0.055, 0.15, 0]);
  add('mpu6050', 'imu', [0.055, 0.12, 0], 'I2C');
  add('tb6612', 'driver', [0.055, 0.09, 0], 'GPIO4');
  add('motor_n20', 'dongCoSau', undefined, 'GPIO26');
  return withStableUids(d);
}

/**
 * uid do addPart sinh ngẫu nhiên — đổi thành uid cố định theo tên, vì thiết kế mẫu là "hạt giống" Yjs
 * phải giống hệt nhau trên mọi máy.
 */
function withStableUids(d: VehicleDesign): VehicleDesign {
  const map = new Map(d.parts.map((p) => [p.uid, `mau_${p.name}`]));
  return {
    ...d,
    parts: d.parts.map((p) => ({
      ...p,
      uid: map.get(p.uid)!,
      ...(p.attachTo ? { attachTo: map.get(p.attachTo) ?? p.attachTo } : {}),
    })),
  };
}
