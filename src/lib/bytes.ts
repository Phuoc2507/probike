// Chuyển đổi nhị phân thuần (không cần mạng) — dùng cho snapshot Yjs và cột bytea.

/** Uint8Array → chuỗi bytea dạng hex mà PostgREST nhận: "\x0a1b..." */
export function toByteaHex(bytes: Uint8Array): string {
  let s = '\\x';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

/** Chuỗi bytea PostgREST trả về ("\x0a1b...") → Uint8Array. Trả null nếu rỗng/không hợp lệ. */
export function fromByteaHex(value: string | null | undefined): Uint8Array | null {
  if (!value || !value.startsWith('\\x')) return null;
  const hex = value.slice(2);
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
