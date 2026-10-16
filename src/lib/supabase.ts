import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** true khi đã cấu hình .env — false trong test/CI, khi đó mọi gọi mạng sẽ lỗi nhưng import không bị vỡ. */
export const supabaseConfigured = Boolean(url && key);

if (!supabaseConfigured && import.meta.env.MODE !== 'test') {
  console.warn('[ProBike] Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY trong .env');
}

export const supabase = createClient(url || 'http://localhost:54321', key || 'chua-cau-hinh');
