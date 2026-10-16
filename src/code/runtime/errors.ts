// Lỗi của code thí sinh: dịch sang tiếng Việt và tìm số dòng.

export class ControllerError extends Error {
  line?: number;
  /** Thông điệp tiếng Việt không kèm "Dòng N:" */
  detail: string;
  constructor(detail: string, line?: number) {
    super(line ? `Dòng ${line}: ${detail}` : detail);
    this.name = 'ControllerError';
    this.detail = detail;
    this.line = line;
  }
}

/** Lỗi do API của ProBike ném ra (đã là tiếng Việt). */
export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Lỗi watchdog: loop() chạy quá lâu. */
export class WatchdogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WatchdogError';
  }
}

const RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(\S+) is not defined$/, (m) => `Chưa khai báo biến/hàm "${m[1]}" (gõ sai tên hoặc quên khai báo?)`],
  [/Cannot read propert(?:y|ies) of (undefined|null)(?: \(reading '(.+)'\))?/, (m) =>
    `Không đọc được ${m[2] ? `"${m[2]}" ` : ''}từ giá trị ${m[1]} (biến chưa có giá trị?)`],
  [/Cannot set propert(?:y|ies) of (undefined|null)(?: \(setting '(.+)'\))?/, (m) =>
    `Không gán được ${m[2] ? `"${m[2]}" ` : ''}vào giá trị ${m[1]}`],
  [/^(.+) is not a function$/, (m) => `"${m[1]}" không phải là hàm (gõ sai tên hàm?)`],
  [/^(.+) is not a constructor$/, (m) => `"${m[1]}" không dùng được với new`],
  [/^(.+) is not iterable$/, (m) => `"${m[1]}" không duyệt được bằng vòng for...of`],
  [/Assignment to constant variable/, () => 'Không được gán lại giá trị cho hằng (const). Dùng let nếu cần thay đổi'],
  [/Maximum call stack size exceeded|too much recursion/, () => 'Gọi hàm lồng nhau quá sâu (đệ quy vô hạn?)'],
  [/Unexpected end of input|end of script|missing \} after/, () => 'Thiếu dấu đóng } hoặc ) — kiểm tra các cặp ngoặc'],
  [/missing \) after argument list/, () => 'Thiếu dấu ) sau danh sách tham số'],
  [/Unexpected token '?([^']+)'?/, (m) => `Sai cú pháp: gặp "${m[1]}" không đúng chỗ`],
  [/Unexpected identifier(?: '(.+)')?/, (m) => `Sai cú pháp: tên ${m[1] ? `"${m[1]}" ` : ''}đặt không đúng chỗ (thiếu dấu ; , hoặc toán tử?)`],
  [/Unexpected number/, () => 'Sai cú pháp: số đặt không đúng chỗ'],
  [/Unexpected string/, () => 'Sai cú pháp: chuỗi đặt không đúng chỗ (thiếu dấu , hoặc +?)'],
  [/Invalid or unexpected token|illegal character/, () => 'Ký tự không hợp lệ (kiểm tra dấu nháy, ký tự lạ)'],
  [/Unexpected strict mode reserved word|reserved word/, () => 'Dùng từ khoá dành riêng làm tên biến'],
  [/Identifier '(.+)' has already been declared|redeclaration of (?:let|const) (\S+)/, (m) =>
    `Biến "${m[1] ?? m[2]}" đã được khai báo rồi`],
  [/Cannot access '(.+)' before initialization|can't access lexical declaration '(.+)' before/, (m) =>
    `Dùng biến "${m[1] ?? m[2]}" trước khi khai báo`],
  [/Illegal return statement|return not in function/, () => 'return chỉ dùng được bên trong hàm'],
  [/Illegal break statement|Illegal continue statement/, () => 'break/continue chỉ dùng được trong vòng lặp'],
  [/Invalid left-hand side in assignment/, () => 'Vế trái của phép gán không hợp lệ (nhầm = với ==?)'],
  [/Invalid array length/, () => 'Độ dài mảng không hợp lệ'],
];

/** Dịch thông điệp lỗi JS sang tiếng Việt (giữ nguyên lỗi đã là tiếng Việt). */
export function translateMessage(err: unknown): string {
  if (err instanceof ApiError || err instanceof WatchdogError || err instanceof ControllerError) return err.message;
  if (!(err instanceof Error)) {
    if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
    return `Code ném ra: ${String(err)}`;
  }
  const msg = err.message;
  for (const [re, fmt] of RULES) {
    const m = msg.match(re);
    if (m) return fmt(m);
  }
  const kind = err.name === 'SyntaxError' ? 'Lỗi cú pháp' : err.name === 'TypeError' ? 'Lỗi kiểu dữ liệu' : 'Lỗi';
  return `${kind}: ${msg}`;
}
