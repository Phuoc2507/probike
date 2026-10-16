// Luật kết thúc lượt chạy và công thức điểm (dùng chung cho web và thể lệ).
//
// Kết thúc:
//   fell           |roll| > 45° hoặc thân xe (không tính bánh) chạm nền / đá / ván cầu
//   out_of_bounds  ra khỏi lòng đường (lệch ngang quá vách 8 cm), trượt khỏi cầu bập bênh,
//                  rơi dưới nền, hoặc (balance_flat) đi xa điểm xuất phát quá 1,2 m
//   timeout        hết maxTimeS — riêng balance_flat: trụ hết giờ = completed
//   completed      qua checkpoint cuối (vạch đích) theo đúng thứ tự
//
// Điểm:
//   score = 100 × (số checkpoint đã qua)
//         + (completed ? round(200 × min(1, parTime / timeS)) : 0)          ← thưởng tốc độ (balance_flat không có)
//         + (completed ? round(100 × balancedS / timeS × max(0, 1 − maxRollDeg / 45)) : 0)  ← thưởng ổn định
//   balancedS = khoảng thời gian liên tục dài nhất mà |roll| ≤ 20°.

import type { MapId, RunEndReason } from '@/shared/types';
import { PAR_TIME_S } from './maps/spec';

export const SCORING = {
  fallRollDeg: 45,
  balancedRollDeg: 20,
  perCheckpoint: 100,
  timeBonusMax: 200,
  stabilityBonusMax: 100,
  /** Lệch ngang tối đa so với mép lòng đường trước khi tính ra khỏi map. */
  laneOutMargin: 0.08,
  /** Lệch thêm so với mép cầu bập bênh = trượt khỏi cầu. */
  bridgeOutMargin: 0.02,
} as const;

export function computeScore(args: {
  mapId: MapId;
  reason: RunEndReason;
  timeS: number;
  checkpoints: number;
  maxRollDeg: number;
  balancedS: number;
}): number {
  const { mapId, reason, timeS, checkpoints, maxRollDeg, balancedS } = args;
  let score = SCORING.perCheckpoint * checkpoints;
  if (reason === 'completed' && timeS > 0) {
    const par = PAR_TIME_S[mapId];
    if (par) score += Math.round(SCORING.timeBonusMax * Math.min(1, par / timeS));
    const steady = Math.max(0, 1 - maxRollDeg / SCORING.fallRollDeg);
    score += Math.round(SCORING.stabilityBonusMax * Math.min(1, balancedS / timeS) * steady);
  }
  return score;
}
