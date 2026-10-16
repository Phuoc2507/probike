// Lớp truyền tin trừu tượng: Supabase Realtime (thật) hoặc bộ nhớ (test, chế độ cá nhân).
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export interface PresenceInfo {
  /** id phiên (mỗi tab một id) */
  sessionId: string;
  userId: string | null;
  name: string;
  color: string;
  /** người này đang làm gì: 'assembly' | 'code' | 'blocks' | 'run'... (tuỳ trang ghép) */
  focus?: string;
  joinedAt: number;
}

export type TransportStatus = 'connecting' | 'online' | 'offline' | 'local';

export interface Transport {
  readonly id: string;
  connect(): Promise<void>;
  send(event: string, payload: Record<string, unknown>): void;
  on(event: string, cb: (payload: Record<string, unknown>) => void): () => void;
  track(info: PresenceInfo): void;
  onPresence(cb: (peers: PresenceInfo[]) => void): () => void;
  onStatus(cb: (s: TransportStatus) => void): () => void;
  close(): void;
}

type Handler = (payload: Record<string, unknown>) => void;

/** Cơ chế đăng ký sự kiện dùng chung cho các transport. */
class Emitter {
  private handlers = new Map<string, Set<Handler>>();
  on(event: string, cb: Handler) {
    let s = this.handlers.get(event);
    if (!s) this.handlers.set(event, (s = new Set()));
    s.add(cb);
    return () => void s!.delete(cb);
  }
  emit(event: string, payload: Record<string, unknown>) {
    this.handlers.get(event)?.forEach((h) => h(payload));
  }
}

export function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------------------------------------------------------------- Supabase Realtime

/** Kênh riêng `team:<teamId>` (private → RLS realtime.messages chỉ cho thành viên đội). */
export class SupabaseTransport implements Transport {
  readonly id = randomId();
  private channel: RealtimeChannel | null = null;
  private events = new Emitter();
  private presenceCbs = new Set<(p: PresenceInfo[]) => void>();
  private statusCbs = new Set<(s: TransportStatus) => void>();
  private me: PresenceInfo | null = null;
  private status: TransportStatus = 'connecting';

  constructor(
    private client: Pick<SupabaseClient, 'channel' | 'removeChannel' | 'realtime'>,
    private topic: string,
  ) {}

  async connect(): Promise<void> {
    await this.client.realtime.setAuth();
    const ch = this.client.channel(this.topic, {
      config: { private: true, broadcast: { self: false, ack: false }, presence: { key: this.id, enabled: true } },
    });
    this.channel = ch;
    ch.on('broadcast', { event: '*' }, (msg: { event: string; payload: Record<string, unknown> }) => {
      this.events.emit(msg.event, msg.payload ?? {});
    });
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<PresenceInfo>();
      const peers = Object.values(state).flatMap((metas) => metas.slice(0, 1)) as unknown as PresenceInfo[];
      this.presenceCbs.forEach((cb) => cb(peers));
    });
    await new Promise<void>((resolve) => {
      let first = true;
      ch.subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          this.setStatus('online');
          if (this.me) void ch.track(this.me as unknown as Record<string, unknown>);
          // Kết nối lại → yêu cầu đồng bộ lại
          if (!first) this.events.emit('__reconnected', {});
          first = false;
          resolve();
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
          this.setStatus('offline');
          if (first) {
            first = false;
            resolve();
          }
        }
      });
    });
  }

  private setStatus(s: TransportStatus) {
    this.status = s;
    this.statusCbs.forEach((cb) => cb(s));
  }

  send(event: string, payload: Record<string, unknown>) {
    if (!this.channel || this.status !== 'online') return;
    void this.channel.send({ type: 'broadcast', event, payload });
  }

  on(event: string, cb: Handler) {
    return this.events.on(event, cb);
  }

  track(info: PresenceInfo) {
    this.me = info;
    if (this.channel && this.status === 'online') void this.channel.track(info as unknown as Record<string, unknown>);
  }

  onPresence(cb: (p: PresenceInfo[]) => void) {
    this.presenceCbs.add(cb);
    return () => void this.presenceCbs.delete(cb);
  }

  onStatus(cb: (s: TransportStatus) => void) {
    this.statusCbs.add(cb);
    cb(this.status);
    return () => void this.statusCbs.delete(cb);
  }

  close() {
    if (this.channel) void this.client.removeChannel(this.channel);
    this.channel = null;
    this.setStatus('offline');
  }
}

// ---------------------------------------------------------------- Bộ nhớ (test / chế độ cá nhân)

/** "Phòng" trong bộ nhớ: mọi MemoryTransport cùng bus nhận tin của nhau (không nhận của chính mình). */
export class MemoryBus {
  members = new Set<MemoryTransport>();
  presence = new Map<string, PresenceInfo>();
  syncPresence() {
    const peers = [...this.presence.values()];
    this.members.forEach((m) => m.presenceChanged(peers));
  }
}

export class MemoryTransport implements Transport {
  readonly id = randomId();
  private events = new Emitter();
  private presenceCbs = new Set<(p: PresenceInfo[]) => void>();
  private statusCbs = new Set<(s: TransportStatus) => void>();
  private connected = false;

  /** bus = null → chạy một mình (chế độ cá nhân): send chỉ vòng về chính mình nếu loopback. */
  constructor(private bus: MemoryBus | null = null) {}

  async connect() {
    this.connected = true;
    this.bus?.members.add(this);
    this.statusCbs.forEach((cb) => cb(this.bus ? 'online' : 'local'));
  }

  send(event: string, payload: Record<string, unknown>) {
    if (!this.connected || !this.bus) return;
    // Sao chép như qua mạng (JSON) để không chia sẻ tham chiếu
    const copy = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    this.bus.members.forEach((m) => m !== this && m.deliver(event, copy));
  }

  deliver(event: string, payload: Record<string, unknown>) {
    this.events.emit(event, payload);
  }

  on(event: string, cb: Handler) {
    return this.events.on(event, cb);
  }

  track(info: PresenceInfo) {
    if (!this.bus) {
      this.presenceChanged([info]);
      return;
    }
    this.bus.presence.set(this.id, info);
    this.bus.syncPresence();
  }

  presenceChanged(peers: PresenceInfo[]) {
    this.presenceCbs.forEach((cb) => cb(peers));
  }

  onPresence(cb: (p: PresenceInfo[]) => void) {
    this.presenceCbs.add(cb);
    return () => void this.presenceCbs.delete(cb);
  }

  onStatus(cb: (s: TransportStatus) => void) {
    this.statusCbs.add(cb);
    cb(this.connected ? (this.bus ? 'online' : 'local') : 'connecting');
    return () => void this.statusCbs.delete(cb);
  }

  close() {
    this.connected = false;
    if (this.bus) {
      this.bus.members.delete(this);
      this.bus.presence.delete(this.id);
      this.bus.syncPresence();
    }
  }
}
