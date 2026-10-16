import { useState } from 'react';
import { Plus, Trash2, Download, FolderPlus } from 'lucide-react';
import { adminAddBudgetItem, adminDeleteBudgetItem, adminListBudget, adminUpdateBudgetItem, type BudgetItem } from '@/lib/api';
import { downloadText, formatVnd, groupBudget, lineTotal, parseVietNumber, toCsv } from '@/lib/format';
import { ErrorBox, Loading, PageTitle, btn, btnPrimary, useLoad } from './ui';

const vn = new Intl.NumberFormat('vi-VN');

export default function Costs() {
  const { data, setData, error, setError, loading } = useLoad(adminListBudget);
  const [saving, setSaving] = useState(0);
  const items = data ?? [];
  const { groups, total } = groupBudget(items);

  async function track<T>(p: Promise<T>): Promise<T> {
    setSaving((n) => n + 1);
    try {
      return await p;
    } finally {
      setSaving((n) => n - 1);
    }
  }

  /** Sửa lạc quan; lỗi thì trả lại danh sách trước đó. */
  async function optimistic(apply: (list: BudgetItem[]) => BudgetItem[], call: () => Promise<{ ok: boolean; error?: string }>) {
    const before = items;
    setData(apply(before));
    const r = await track(call());
    if (!r.ok) {
      setData(before);
      setError(`${r.error ?? 'Lỗi'} — đã hoàn tác thay đổi`);
    } else setError(null);
  }

  async function save(id: string, patch: Partial<BudgetItem>) {
    await optimistic(
      (list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      () => adminUpdateBudgetItem(id, patch),
    );
  }

  async function addRow(category: string) {
    const maxSort = Math.max(0, ...items.map((i) => i.sort));
    const r = await track(adminAddBudgetItem({ category, name: '', qty: 1, unitPrice: 0, note: '', sort: maxSort + 10 }));
    if (r.ok) setData((list) => [...(list ?? []), r.data]);
    else setError(r.error);
  }

  async function addCategory() {
    const name = window.prompt('Tên hạng mục mới (ví dụ: Hậu cần)');
    if (name?.trim()) await addRow(name.trim());
  }

  async function renameCategory(from: string, to: string) {
    const t = to.trim();
    if (!t || t === from) return;
    const ids = items.filter((i) => i.category === from).map((i) => i.id);
    await optimistic(
      (list) => list.map((it) => (ids.includes(it.id) ? { ...it, category: t } : it)),
      async () => {
        const rs = await Promise.all(ids.map((id) => adminUpdateBudgetItem(id, { category: t })));
        const bad = rs.find((r) => !r.ok);
        if (!bad) return { ok: true };
        // Một phần đã đổi: đưa các dòng đã đổi về tên cũ để không bị tách hạng mục
        await Promise.all(ids.map((id, i) => rs[i].ok && adminUpdateBudgetItem(id, { category: from })));
        return bad;
      },
    );
  }

  async function remove(it: BudgetItem) {
    if (!window.confirm(`Xoá dòng "${it.name || '(chưa đặt tên)'}"?`)) return;
    await optimistic((list) => list.filter((x) => x.id !== it.id), () => adminDeleteBudgetItem(it.id));
  }

  function exportCsv() {
    const rows: (string | number)[][] = [['Hạng mục', 'Khoản chi', 'Số lượng', 'Đơn giá (đ)', 'Thành tiền (đ)', 'Ghi chú']];
    for (const g of groups) for (const it of g.items) rows.push([g.category, it.name, it.qty, it.unitPrice, lineTotal(it), it.note]);
    rows.push(['', 'TỔNG CỘNG', '', '', total, '']);
    downloadText('chi-phi-to-chuc-probike.csv', toCsv(rows));
  }

  if (loading) return <Loading />;

  return (
    <div>
      <PageTitle
        title="Chi phí tổ chức"
        sub={saving ? 'Đang lưu…' : 'Sửa trực tiếp trong bảng — tự lưu khi rời ô'}
        right={
          <>
            <button className={btn} onClick={exportCsv}><Download size={16} /> Xuất CSV</button>
            <button className={btnPrimary} onClick={() => void addCategory()}><FolderPlus size={16} /> Thêm hạng mục</button>
          </>
        }
      />
      <ErrorBox text={error} />

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase text-ink-soft">
            <tr>
              <th className="px-3 py-2">Khoản chi</th>
              <th className="w-24 px-3 py-2 text-right">SL</th>
              <th className="w-36 px-3 py-2 text-right">Đơn giá (đ)</th>
              <th className="w-36 px-3 py-2 text-right">Thành tiền</th>
              <th className="px-3 py-2">Ghi chú</th>
              <th className="w-10" />
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.category} className="border-t border-line">
              <tr className="bg-brand/5">
                <td colSpan={3} className="px-3 py-2">
                  <input
                    defaultValue={g.category}
                    key={g.category}
                    onBlur={(e) => void renameCategory(g.category, e.target.value)}
                    className="w-full bg-transparent font-semibold text-ink outline-none focus:underline"
                    title="Bấm để đổi tên hạng mục"
                  />
                </td>
                <td className="px-3 py-2 text-right font-semibold">{formatVnd(g.total)}</td>
                <td colSpan={2} className="px-3 py-2 text-right">
                  <button className="inline-flex items-center gap-1 text-xs text-brand-dark hover:underline" onClick={() => void addRow(g.category)}>
                    <Plus size={14} /> Thêm dòng
                  </button>
                </td>
              </tr>
              {g.items.map((it) => (
                <tr key={it.id} className="border-t border-line/60 hover:bg-surface-2/50">
                  <td className="px-1 py-1"><Cell value={it.name} onSave={(v) => save(it.id, { name: v })} placeholder="Tên khoản chi" /></td>
                  <td className="px-1 py-1"><NumCell value={it.qty} onSave={(v) => save(it.id, { qty: v })} /></td>
                  <td className="px-1 py-1"><NumCell value={it.unitPrice} onSave={(v) => save(it.id, { unitPrice: v })} /></td>
                  <td className="px-3 py-1 text-right tabular-nums">{vn.format(lineTotal(it))}</td>
                  <td className="px-1 py-1"><Cell value={it.note} onSave={(v) => save(it.id, { note: v })} placeholder="—" /></td>
                  <td className="px-1 py-1 text-center">
                    <button onClick={() => void remove(it)} className="rounded p-1 text-ink-soft hover:bg-red-50 hover:text-red-600" title="Xoá dòng">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
          <tfoot className="border-t-2 border-ink/20 bg-surface-2">
            <tr>
              <td colSpan={3} className="px-3 py-3 text-right font-bold">TỔNG CỘNG</td>
              <td className="px-3 py-3 text-right text-base font-bold text-brand-dark">{formatVnd(total)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      {groups.length === 0 && <p className="mt-4 text-center text-ink-soft">Chưa có khoản chi nào — bấm “Thêm hạng mục”.</p>}
    </div>
  );
}

const cellCls = 'w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 outline-none hover:border-line focus:border-brand focus:bg-surface';

function Cell({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  return (
    <input
      key={value}
      defaultValue={value}
      placeholder={placeholder}
      onBlur={(e) => e.target.value !== value && onSave(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={cellCls}
    />
  );
}

function NumCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  return (
    <input
      key={value}
      defaultValue={vn.format(value)}
      inputMode="decimal"
      onFocus={(e) => e.target.select()}
      onBlur={(e) => {
        const n = parseVietNumber(e.target.value);
        if (n !== value) onSave(n);
        else e.target.value = vn.format(value);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={`${cellCls} text-right tabular-nums`}
    />
  );
}
