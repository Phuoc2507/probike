// Xe mẫu khởi đầu — đều hợp lệ theo luật (xe "Mạnh mẽ" cố ý vượt ngân sách để tham khảo).
import type { Vec3, VehicleDesign } from '@/shared/types';
import { addPart, createEmptyDesign, setFrame, updatePart } from './design';

interface PartSpec { itemId: string; name: string; position?: Vec3; rotationDeg?: Vec3; pin?: string }

function build(name: string, frame: Parameters<typeof setFrame>[1], specs: PartSpec[]): VehicleDesign {
  let d = setFrame(createEmptyDesign(name), frame);
  for (const s of specs) {
    const r = addPart(d, s.itemId, { position: s.position, rotationDeg: s.rotationDeg, name: s.name });
    d = s.pin ? updatePart(r.design, r.uid, { pin: s.pin }) : r.design;
  }
  return d;
}

export interface DesignPreset {
  id: string;
  title: string;
  summary: string;
  create: () => VehicleDesign;
}

export const PRESETS: DesignPreset[] = [
  {
    id: 'co_ban',
    title: 'Xe cơ bản',
    summary: 'Arduino Nano, bánh đà DC 370 + đĩa nhôm, laser đo phía trước. Khoảng 590.000 đ.',
    create: () => build('Xe cơ bản', { wheelbase: 0.2, height: 0.12, material: 'mica' }, [
      { itemId: 'battery_18650x2', name: 'pin', position: [0, 0.05, 0] },
      { itemId: 'motor_rw_dc', name: 'banhDa', position: [-0.025, 0.12, 0], pin: 'D9' },
      { itemId: 'flywheel_al_80', name: 'diaBanhDa' },
      { itemId: 'arduino_nano', name: 'viDieuKhien', position: [0.04, 0.15, 0] },
      { itemId: 'mpu6050', name: 'imu', position: [0.04, 0.1, 0], pin: 'I2C' },
      { itemId: 'tb6612', name: 'driver', position: [0.04, 0.075, 0], pin: 'D7' },
      { itemId: 'motor_n20', name: 'dongCoSau', pin: 'D10' },
      { itemId: 'vl53l0x', name: 'laserTruoc', position: [0.075, 0.085, 0], pin: 'I2C' },
      { itemId: 'buck_lm2596', name: 'haAp', position: [-0.06, 0.08, 0] },
    ]),
  },
  {
    id: 'manh_me',
    title: 'Xe mạnh mẽ',
    summary: 'ESP32, bánh đà BLDC + đĩa thép, servo lái, laser + siêu âm. Vượt ngân sách — để tham khảo.',
    create: () => build('Xe mạnh mẽ', { wheelbase: 0.24, height: 0.14, material: 'aluminum', steerable: true }, [
      { itemId: 'lipo_2s_1000', name: 'pin', position: [0, 0.05, 0] },
      { itemId: 'motor_rw_bldc', name: 'banhDa', position: [-0.03, 0.12, 0], pin: 'GPIO25' },
      { itemId: 'flywheel_steel_100', name: 'diaBanhDa' },
      { itemId: 'esp32', name: 'viDieuKhien', position: [0.045, 0.165, 0] },
      { itemId: 'mpu9250', name: 'imu', position: [0.045, 0.12, 0], pin: 'I2C' },
      { itemId: 'tb6612', name: 'driver', position: [0.045, 0.09, 0], pin: 'GPIO4' },
      { itemId: 'motor_n20', name: 'dongCoSau', pin: 'GPIO26' },
      { itemId: 'servo_sg90', name: 'lai', pin: 'GPIO27' },
      { itemId: 'vl53l1x', name: 'laserTruoc', position: [0.135, 0.115, 0], pin: 'I2C' },
      { itemId: 'hcsr04', name: 'sieuAmTruoc', position: [0.08, 0.14, 0], pin: 'GPIO5' },
      { itemId: 'buck_lm2596', name: 'haAp', position: [-0.075, 0.085, 0] },
    ]),
  },
  {
    id: 'tiet_kiem',
    title: 'Xe tiết kiệm',
    summary: 'STM32, khung carton, động cơ TT, siêu âm + dò vạch. Khoảng 445.000 đ.',
    create: () => build('Xe tiết kiệm', { wheelbase: 0.18, height: 0.1, material: 'carton' }, [
      { itemId: 'battery_18650x2', name: 'pin', position: [0, 0.05, 0] },
      { itemId: 'motor_rw_dc', name: 'banhDa', position: [-0.02, 0.105, 0], pin: 'PA8' },
      { itemId: 'flywheel_al_80', name: 'diaBanhDa' },
      { itemId: 'stm32_bluepill', name: 'viDieuKhien', position: [0.035, 0.13, 0] },
      { itemId: 'mpu6050', name: 'imu', position: [0.035, 0.1, 0], pin: 'I2C' },
      { itemId: 'l298n', name: 'driver', position: [-0.06, 0.09, 0], pin: 'PB12' },
      { itemId: 'motor_tt', name: 'dongCoSau', pin: 'PA9' },
      { itemId: 'hcsr04', name: 'sieuAmTruoc', position: [0.06, 0.08, 0], pin: 'PA0' },
      { itemId: 'tcrt5000', name: 'doVach', position: [0.04, 0.03, 0], pin: 'PA1' },
    ]),
  },
];

/** Thiết kế mặc định cho đội mới. */
export function createDefaultDesign(): VehicleDesign {
  return PRESETS[0].create();
}
