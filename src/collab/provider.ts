// Đồng bộ Yjs qua broadcast (Supabase Realtime hoặc MemoryTransport).
//
// Giao thức (tương tự y-protocols/sync nhưng qua broadcast):
//   y-sv {from, sv, reply?}  : "đây là state vector của tôi" — người nhận gửi lại phần tôi còn thiếu (y-up có `to`),
//                              và nếu không phải tin trả lời thì gửi lại sv của họ để tôi bù phần họ thiếu.
//   y-up {from, u, to?}      : cập nhật Yjs (gộp theo lô ~40 ms). `to` = chỉ dành cho một người.
import * as Y from 'yjs';
import { fromBase64, toBase64 } from '@/lib/bytes';
import type { Transport } from './transport';

export interface ProviderOptions {
  /** gom cập nhật trong khoảng này rồi mới gửi (ms) */
  batchMs?: number;
  /** coi như đã đồng bộ nếu không ai trả lời sau khoảng này (ms) — ví dụ chỉ có mình trong phòng */
  syncTimeoutMs?: number;
}

export class YjsBroadcastProvider {
  synced = false;
  private queue: Uint8Array[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private offs: (() => void)[] = [];
  private syncedCbs = new Set<() => void>();
  private batchMs: number;
  private syncTimeoutMs: number;

  constructor(private doc: Y.Doc, private transport: Transport, opts: ProviderOptions = {}) {
    this.batchMs = opts.batchMs ?? 40;
    this.syncTimeoutMs = opts.syncTimeoutMs ?? 1500;
    this.doc.on('update', this.onDocUpdate);
    this.offs.push(
      transport.on('y-sv', (p) => this.onStateVector(p)),
      transport.on('y-up', (p) => this.onUpdate(p)),
      transport.on('__reconnected', () => this.requestSync()),
    );
  }

  get id() {
    return this.transport.id;
  }

  /** Gọi sau khi transport đã kết nối. */
  requestSync() {
    this.transport.send('y-sv', { from: this.id, sv: toBase64(Y.encodeStateVector(this.doc)) });
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.markSynced(), this.syncTimeoutMs);
  }

  onSynced(cb: () => void) {
    if (this.synced) cb();
    else this.syncedCbs.add(cb);
    return () => void this.syncedCbs.delete(cb);
  }

  private markSynced() {
    if (this.synced) return;
    this.synced = true;
    this.syncedCbs.forEach((cb) => cb());
    this.syncedCbs.clear();
  }

  private onStateVector(p: Record<string, unknown>) {
    const from = p.from as string;
    if (from === this.id) return;
    const diff = Y.encodeStateAsUpdate(this.doc, fromBase64(p.sv as string));
    this.transport.send('y-up', { from: this.id, to: from, u: toBase64(diff) });
    if (!p.reply) this.transport.send('y-sv', { from: this.id, sv: toBase64(Y.encodeStateVector(this.doc)), reply: true });
  }

  private onUpdate(p: Record<string, unknown>) {
    if (p.from === this.id) return;
    if (p.to && p.to !== this.id) return;
    Y.applyUpdate(this.doc, fromBase64(p.u as string), this);
    if (p.to === this.id) this.markSynced();
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return; // đến từ mạng, không phát lại
    this.queue.push(update);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.batchMs);
  };

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.queue.length) return;
    const merged = this.queue.length === 1 ? this.queue[0] : Y.mergeUpdates(this.queue);
    this.queue = [];
    this.transport.send('y-up', { from: this.id, u: toBase64(merged) });
  }

  destroy() {
    this.flush();
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.doc.off('update', this.onDocUpdate);
    this.offs.forEach((f) => f());
    this.offs = [];
  }
}
