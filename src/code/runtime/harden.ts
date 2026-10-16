// Lớp bảo vệ thứ hai, chạy trong Worker trước khi nạp code thí sinh: gỡ API nguy hiểm khỏi phạm vi toàn cục
// và chặn các đường lách ra phạm vi toàn cục như (function(){}).constructor("return this")().
// Mọi hàm nhận "realm" (đối tượng toàn cục) làm tham số để test được trong vm context của Node.

import { ApiError } from './errors';

export const HARDEN_NAMES = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'Worker', 'SharedWorker',
  'BroadcastChannel', 'indexedDB', 'caches', 'WebTransport', 'RTCPeerConnection',
  // Worker: luồng chính chỉ nhận tin do runtime gửi (đã bind sẵn trước khi gọi harden)
  'postMessage', 'close',
];

const blocked = (name: string) => () => {
  throw new ApiError(`Không được dùng ${name} trong code xe`);
};

export function hardenGlobalScope(scope: object, names: string[] = HARDEN_NAMES): void {
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

interface Realm {
  Function: FunctionConstructor;
  Math: Math;
  eval?: unknown;
}

/**
 * Chặn constructor của mọi loại hàm (thường, async, generator, async generator) — đường lách phổ biến nhất ra
 * phạm vi toàn cục — và eval gián tiếp. Đóng băng Math để code thí sinh không sửa được hàm toán dùng chung.
 * Không ảnh hưởng runtime vì lõi gọi thẳng `new Function(...)` qua tên toàn cục, đã chụp sẵn trước khi gọi hàm này.
 */
export function hardenRealm(realm: Realm): void {
  const F = realm.Function;
  // Lấy constructor của các loại hàm khác bằng chính Function của realm (không cần cú pháp async ở đây)
  const kinds: { prototype: object }[] = [F];
  for (const src of ['return (async function () {})', 'return (function* () {})', 'return (async function* () {})']) {
    try {
      const fn = F(src)() as object;
      kinds.push((Object.getPrototypeOf(fn) as { constructor: { prototype: object } }).constructor);
    } catch { /* engine không hỗ trợ */ }
  }
  for (const k of kinds) {
    try {
      Object.defineProperty(k.prototype, 'constructor', { value: blocked('Function'), writable: false, configurable: false });
    } catch { /* bỏ qua */ }
  }
  try {
    Object.defineProperty(realm, 'eval', { value: blocked('eval'), writable: false, configurable: false });
  } catch { /* bỏ qua */ }
  try { Object.freeze(realm.Math); } catch { /* bỏ qua */ }
}
