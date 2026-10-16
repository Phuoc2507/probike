// Gỡ các API nguy hiểm khỏi phạm vi toàn cục của Worker (lớp bảo vệ thứ hai, phòng khi code thí sinh
// lách được lớp che tên trong core, ví dụ qua (()=>{}).constructor("return this")()).

export const HARDEN_NAMES = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'Worker', 'SharedWorker',
  'BroadcastChannel', 'indexedDB', 'caches', 'WebTransport', 'RTCPeerConnection',
];

export function hardenGlobalScope(scope: object, names: string[] = HARDEN_NAMES): void {
  const blocked = (name: string) => () => {
    throw new Error(`Không được dùng ${name} trong code xe`);
  };
  // Xoá cả trên chuỗi prototype (WorkerGlobalScope.prototype.fetch...)
  let proto: object | null = Object.getPrototypeOf(scope);
  while (proto && proto !== Object.prototype) {
    for (const name of names) {
      if (Object.prototype.hasOwnProperty.call(proto, name)) {
        try { delete (proto as Record<string, unknown>)[name]; } catch { /* bỏ qua */ }
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
  for (const name of names) {
    try {
      Object.defineProperty(scope, name, { value: blocked(name), writable: false, configurable: false });
    } catch { /* bỏ qua */ }
  }
}
