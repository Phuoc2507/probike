// NGUỒN SỐ ĐO DUY NHẤT của sa hình (PLAN.md mục 3). Sửa ở đây là mô phỏng, hình 3D và thể lệ cùng đổi.
// Đơn vị: mét, độ, giây, kg. Hệ toạ độ như hợp đồng: x tiến, y lên, z sang PHẢI (hệ tay phải).

import type { MapId } from '@/shared/types';

export const COURSE = {
  /** Kích thước tổng của sa hình thật (đề xuất). */
  sizeM: [4.0, 2.5] as [number, number],
  /** Lòng đường giữa hai vách. */
  laneWidth: 0.5,
  wallHeight: 0.15,
  /** Vách carton dày ~1 cm. */
  wallThickness: 0.01,
  /** Vạch sơn trắng (xuất phát, checkpoint, đích) rộng 2 cm. */
  lineWidth: 0.02,
  /** Ma sát nền carton phủ sơn (Rapier lấy trung bình với ma sát bánh). */
  floorFriction: 0.9,
  wallFriction: 0.4,
  colors: { floor: '#9ca3af', wall: '#ffffff', line: '#ffffff', bridge: '#c8a165', rock: '#78716c' },
} as const;

export const SEGMENTS = {
  /** 1. Xuất phát — đoạn thẳng 1,2 m. */
  start: { length: 1.2 },
  /** 2. Cua chữ U — bán kính tâm đường 60 cm, quay đầu 180°, rẽ TRÁI (về phía −z). */
  uTurn: { radius: 0.6, angleDeg: 180 },
  /** 3. Cầu bập bênh — trục xoay giữa cầu, không có vách hai bên cầu. */
  seesaw: {
    length: 1.0,
    width: 0.25,
    /** Ván cầu dày 6 mm. */
    thickness: 0.006,
    maxTiltDeg: 10,
    /** Khối lượng ván (carton + nẹp gỗ). */
    massKg: 0.35,
    /** Hai đầu ván vát mỏng dần trên đoạn 4 cm để bánh leo lên được (mép ván không thành bậc). */
    bevelLength: 0.04,
    /**
     * Độ cao mặt ván tại trục xoay = L/2·sin(10°) ≈ 8,7 cm (PLAN: "dốc lên cao 8 cm"):
     * khi nghiêng hết 10°, mép vát của đầu thấp vừa chạm nền.
     */
    pivotHeight: 0.5 * Math.sin((10 * Math.PI) / 180),
    angularDamping: 1.5,
  },
  /** 4. Bãi đá — đá dăm dán cố định, sinh ngẫu nhiên theo seed. */
  rocks: {
    length: 0.8,
    minHeight: 0.005,
    maxHeight: 0.015,
    /** Bán trục ngang của mỗi viên đá. */
    minRadius: 0.008,
    maxRadius: 0.022,
    /** Số viên trên mỗi m² mặt đường. */
    densityPerM2: 110,
    /** Chừa khoảng trống sát vách. */
    wallMargin: 0.02,
  },
  /** 5. Đích — đoạn thẳng 0,8 m, vạch đích ở cuối đoạn. */
  finish: { length: 0.8 },
  /** Đoạn dư sau vạch đích để xe phanh, có vách chặn cuối. */
  runout: 0.35,
  /** Đoạn dẫn vào/ra cho các map luyện từng đoạn. */
  leadIn: 0.4,
  leadOut: 0.4,
  /** Vị trí gốc xe (trung điểm 2 điểm tiếp đất) tính từ vách đầu đường. */
  startOffset: 0.2,
} as const;

export const BALANCE_FLAT = {
  /** Sàn phẳng vuông, cạnh 3 m, không vách. */
  floorSize: 3.0,
  /** Ra xa điểm xuất phát quá bán kính này = ra khỏi map. */
  boundsRadius: 1.2,
  /** Checkpoint theo thời gian giữ thăng bằng (giây). */
  checkpointTimes: [10, 20, 30],
} as const;

/** Thời gian chuẩn (giây) để tính điểm thưởng tốc độ; balance_flat không có. */
export const PAR_TIME_S: Record<MapId, number | null> = {
  balance_flat: null,
  straight: 2.5,
  u_turn: 3.5,
  seesaw: 3.5,
  rocks: 3,
  full_course: 10,
};

export const MAP_NAMES: Record<MapId, string> = {
  balance_flat: 'Sàn phẳng giữ thăng bằng',
  straight: 'Đoạn thẳng',
  u_turn: 'Cua chữ U',
  seesaw: 'Cầu bập bênh',
  rocks: 'Bãi đá',
  full_course: 'Toàn bộ sa hình',
};

export const MAP_IDS: MapId[] = ['balance_flat', 'straight', 'u_turn', 'seesaw', 'rocks', 'full_course'];

/** Tên checkpoint hiển thị (id dùng trong RunResult.checkpoints). */
export const CHECKPOINT_NAMES: Record<string, string> = {
  giu_10s: 'Giữ 10 giây',
  giu_20s: 'Giữ 20 giây',
  giu_30s: 'Giữ 30 giây',
  xuat_phat: 'Hết đoạn xuất phát',
  cua_u: 'Qua cua chữ U',
  cau_bap_benh: 'Qua cầu bập bênh',
  bai_da: 'Qua bãi đá',
  dich: 'Về đích',
};
