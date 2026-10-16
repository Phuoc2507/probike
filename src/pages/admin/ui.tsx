// Thành phần dùng chung cho các trang BTC.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Team } from '@/shared/types';
import type { Result } from '@/lib/api';

export const STATUS_LABEL: Record<Team['status'], string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
};

const STATUS_CLS: Record<Team['status'], string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
};

export function StatusBadge({ status }: { status: Team['status'] }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLS[status]}`}>{STATUS_LABEL[status]}</span>;
}

export const STAGE_LABEL: Record<number, string> = { 1: '1 · Lắp ráp', 2: '2 · Cân bằng', 3: '3 · Sa hình' };

export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {sub && <p className="text-sm text-ink-soft">{sub}</p>}
      </div>
      <div className="ml-auto flex flex-wrap gap-2">{right}</div>
    </div>
  );
}

export function ErrorBox({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{text}</p>;
}

export function Loading() {
  return <p className="py-10 text-center text-ink-soft">Đang tải…</p>;
}

/** Gọi một hàm api trả Result<T>, kèm reload. */
export function useLoad<T>(fn: () => Promise<Result<T>>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fn, deps);
  const reload = useCallback(async () => {
    setLoading(true);
    const r = await load();
    if (r.ok) {
      setData(r.data);
      setError(null);
    } else setError(r.error);
    setLoading(false);
  }, [load]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, setData, error, setError, loading, reload };
}

export const btn = 'inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50';
export const btnPrimary = 'inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50';
