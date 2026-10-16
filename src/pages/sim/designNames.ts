// Tìm tên linh kiện trong thiết kế để điền vào code mẫu và kiểm tra trước khi chạy.
import type { VehicleDesign } from '@/shared/types';
import { CATALOG_BY_ID } from '@/shared/catalog';
import type { SampleNames } from './samples';

export function namesFromDesign(design: VehicleDesign): SampleNames {
  const item = (id: string) => CATALOG_BY_ID[id];
  const reaction = design.parts.find((p) => item(p.itemId)?.motor?.kind === 'reaction');
  const encoders = design.parts.filter((p) => item(p.itemId)?.sensor?.kind === 'encoder');
  const enc = (reaction && encoders.find((p) => p.attachTo === reaction.uid)) ?? null;
  const drive = design.parts.find((p) => item(p.itemId)?.motor?.kind === 'drive') ?? null;
  return { flywheel: reaction?.name ?? 'banhDa', encoder: enc?.name ?? null, drive: drive?.name ?? null };
}

/** Tên mọi linh kiện (trừ bánh xe) — cho gợi ý trong trình soạn code/khối. */
export function partNamesOf(design: VehicleDesign): string[] {
  return design.parts.filter((p) => p.itemId !== 'wheel_btc').map((p) => p.name);
}

export function hasImu(design: VehicleDesign): boolean {
  return design.parts.some((p) => CATALOG_BY_ID[p.itemId]?.sensor?.kind === 'imu');
}
