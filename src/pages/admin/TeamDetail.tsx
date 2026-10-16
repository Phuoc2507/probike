import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, X } from 'lucide-react';
import type { Team } from '@/shared/types';
import { CATALOG_BY_ID } from '@/shared/catalog';
import { adminGetTeam, adminSetTeamStatus, listTeamRuns } from '@/lib/api';
import { formatDateTime, formatVnd } from '@/lib/format';
import { ErrorBox, Loading, PageTitle, STAGE_LABEL, StatusBadge, btn, useLoad } from './ui';

const getItem = (id: string) => CATALOG_BY_ID[id] as (typeof CATALOG_BY_ID)[string] | undefined;

const REASON: Record<string, string> = {
  completed: 'Hoàn thành', fell: 'Đổ xe', timeout: 'Hết giờ', out_of_bounds: 'Ra ngoài', code_error: 'Lỗi code', stopped: 'Dừng',
};

export default function TeamDetail() {
  const { id = '' } = useParams();
  const t = useLoad(() => adminGetTeam(id), [id]);
  const runs = useLoad(() => listTeamRuns(id, 100), [id]);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (t.loading) return <Loading />;
  if (!t.data) return <ErrorBox text={t.error ?? 'Không tìm thấy đội'} />;
  const d = t.data;
  const noteValue = note ?? d.adminNote;

  async function setStatus(status: Team['status']) {
    setBusy(true);
    const r = await adminSetTeamStatus(id, status, noteValue);
    setBusy(false);
    if (!r.ok) return t.setError(r.error);
    t.setData((x) => (x ? { ...x, team: { ...x.team, status }, adminNote: noteValue } : x));
  }

  const parts = d.design?.parts ?? [];
  const cost = parts.reduce((s, p) => {
    const it = getItem(p.itemId);
    return s + (it && !it.providedByBtc ? it.priceVnd : 0);
  }, 0);

  return (
    <div>
      <Link to="/btc/doi" className="mb-3 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"><ArrowLeft size={14} /> Danh sách đội</Link>
      <PageTitle title={d.team.name} sub={`${d.team.school} · đăng ký ${formatDateTime(d.team.createdAt)}`} right={<StatusBadge status={d.team.status} />} />
      <ErrorBox text={t.error} />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-line bg-surface p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Thành viên ({d.members.length}/5)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-soft">
                <tr><th className="py-1">Họ tên</th><th>Vai trò</th><th>Email</th><th>SĐT</th><th>Tài khoản</th></tr>
              </thead>
              <tbody>
                {d.members.map((m) => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="py-2 font-medium">{m.fullName}</td>
                    <td>{m.roleInTeam || '—'}</td>
                    <td>{m.email}</td>
                    <td>{m.phone || '—'}</td>
                    <td>{m.userId ? <span className="text-green-700">Đã vào</span> : <span className="text-ink-soft">Chưa</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-3 font-semibold">Duyệt đội</h2>
          <textarea
            value={noteValue}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú của BTC (chỉ BTC thấy)"
            rows={3}
            className="mb-3 w-full rounded-lg border border-line p-2 text-sm outline-none focus:border-brand"
          />
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => void setStatus('approved')} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"><Check size={16} /> Duyệt</button>
            <button disabled={busy} onClick={() => void setStatus('rejected')} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 disabled:opacity-50"><X size={16} /> Từ chối</button>
            <button disabled={busy} onClick={() => void setStatus(d.team.status)} className={btn}>Lưu ghi chú</button>
          </div>

          <h2 className="mb-2 mt-6 font-semibold">Tiến độ</h2>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-ink-soft">Giai đoạn</dt><dd>{STAGE_LABEL[d.progress?.stageReached ?? 1]}</dd>
            <dt className="text-ink-soft">Cân bằng lâu nhất</dt><dd>{(d.progress?.balanceBestS ?? 0).toFixed(1)} s</dd>
            <dt className="text-ink-soft">Điểm tốt nhất</dt><dd>{d.progress?.bestScore ?? 0}</dd>
            <dt className="text-ink-soft">Cập nhật</dt><dd>{formatDateTime(d.progress?.updatedAt)}</dd>
          </dl>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5 lg:col-span-3">
          <h2 className="mb-1 font-semibold">Thiết kế xe {d.design?.name ? `· ${d.design.name}` : ''}</h2>
          <p className="mb-3 text-xs text-ink-soft">Lưu lần cuối {formatDateTime(d.workspaceUpdatedAt)}</p>
          {d.design ? (
            <>
              <p className="mb-3 text-sm">
                Khung {d.design.frame.material}, trục bánh {(d.design.frame.wheelbase * 100).toFixed(0)} cm, cao {(d.design.frame.height * 100).toFixed(0)} cm ·
                {' '}{parts.length} linh kiện · chi phí ước tính <b>{formatVnd(cost)}</b>
              </p>
              <div className="flex flex-wrap gap-2">
                {parts.map((p) => (
                  <span key={p.uid} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs">
                    <b>{p.name}</b> · {getItem(p.itemId)?.name ?? p.itemId}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-soft">Đội chưa lưu thiết kế.</p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5 lg:col-span-3">
          <h2 className="mb-3 font-semibold">Lịch sử chạy ({runs.data?.length ?? 0})</h2>
          <ErrorBox text={runs.error} />
          {runs.data && runs.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-ink-soft">
                  <tr><th className="py-1">Thời điểm</th><th>Map</th><th>Kết quả</th><th className="text-right">Thời gian</th><th className="text-right">Checkpoint</th><th className="text-right">Điểm</th></tr>
                </thead>
                <tbody>
                  {runs.data.map((r) => (
                    <tr key={r.id} className="border-t border-line">
                      <td className="py-1.5">{formatDateTime(r.createdAt)}</td>
                      <td>{r.mapId}</td>
                      <td>{REASON[r.result.reason] ?? r.result.reason}</td>
                      <td className="text-right tabular-nums">{r.timeS.toFixed(2)} s</td>
                      <td className="text-right">{r.result.checkpoints?.length ?? 0}</td>
                      <td className="text-right font-semibold">{r.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !runs.loading && <p className="text-sm text-ink-soft">Chưa có lượt chạy nào.</p>
          )}
        </section>
      </div>
    </div>
  );
}
