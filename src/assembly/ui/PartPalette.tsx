// Kho linh kiện chia theo nhóm. Kéo thẻ vào cảnh 3D để gắn, hoặc bấm nút + để gắn vào chỗ mặc định.
import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { CatalogItem, PartCategory } from '@/shared/types';
import { CATALOG } from '@/shared/catalog';
import { fmtVnd } from '../rules';

export const DRAG_MIME = 'application/x-probike-item';

export const CATEGORY_LABEL: Record<PartCategory, string> = {
  wheel: 'Bánh xe',
  controller: 'Vi điều khiển',
  sensor: 'Cảm biến',
  motor: 'Động cơ & servo',
  flywheel: 'Đĩa bánh đà',
  driver: 'Mạch công suất',
  power: 'Nguồn điện',
  structure: 'Kết cấu',
};

const ORDER: PartCategory[] = ['controller', 'sensor', 'motor', 'flywheel', 'driver', 'power', 'structure'];

const CATEGORY_DOT: Record<PartCategory, string> = {
  wheel: 'bg-slate-700',
  controller: 'bg-cyan-600',
  sensor: 'bg-violet-500',
  motor: 'bg-slate-400',
  flywheel: 'bg-orange-500',
  driver: 'bg-red-500',
  power: 'bg-green-600',
  structure: 'bg-amber-500',
};

export function PartPalette({ onAdd, disabled }: { onAdd: (itemId: string) => void; disabled?: boolean }) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ORDER.map((cat) => ({
      cat,
      items: CATALOG.filter(
        (c) => c.category === cat && (!q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <div className="flex h-full flex-col">
      <div className="relative px-3 pb-2">
        <Search className="pointer-events-none absolute left-5 top-2 h-4 w-4 text-ink-soft" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm linh kiện…"
          className="w-full rounded-md border border-line bg-surface py-1.5 pl-8 pr-2 text-sm outline-none focus:border-brand"
        />
      </div>
      <p className="px-3 pb-2 text-xs text-ink-soft">Kéo linh kiện vào xe, hoặc bấm + để gắn nhanh.</p>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        {groups.map((g) => (
          <section key={g.cat}>
            <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              <span className={`h-2 w-2 rounded-full ${CATEGORY_DOT[g.cat]}`} />
              {CATEGORY_LABEL[g.cat]}
            </h4>
            <ul className="space-y-1">
              {g.items.map((item) => (
                <PaletteCard key={item.id} item={item} onAdd={onAdd} disabled={disabled} />
              ))}
            </ul>
          </section>
        ))}
        {groups.length === 0 && <p className="text-sm text-ink-soft">Không tìm thấy linh kiện nào.</p>}
      </div>
    </div>
  );
}

function PaletteCard({ item, onAdd, disabled }: { item: CatalogItem; onAdd: (id: string) => void; disabled?: boolean }) {
  return (
    <li
      draggable={!disabled}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, item.id);
        e.dataTransfer.setData('text/plain', item.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      title={item.description}
      className={`group flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1.5 text-sm ${
        disabled ? 'opacity-60' : 'cursor-grab hover:border-brand active:cursor-grabbing'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-ink">{item.name}</div>
        <div className="text-xs text-ink-soft">
          {fmtVnd(item.priceVnd)} · {Math.round(item.massKg * 1000)} g
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAdd(item.id)}
        className="rounded p-1 text-ink-soft hover:bg-brand hover:text-white disabled:pointer-events-none"
        aria-label={`Gắn ${item.name}`}
      >
        <Plus className="h-4 w-4" />
      </button>
    </li>
  );
}
