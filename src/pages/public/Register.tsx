import { useEffect, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, Loader2, Plus, Trash2, UserRound, Users } from 'lucide-react';
import PageHeader from '@/components/site/PageHeader';
import { registerTeam } from '@/lib/api';
import {
  MAX_EXTRA_MEMBERS,
  ROLES_IN_TEAM,
  emptyForm,
  emptyMember,
  toRegisterInput,
  validateRegister,
  type FormErrors,
  type MemberForm,
  type RegisterForm,
} from './registerValidation';

const inputClass = (err?: string) =>
  `mt-1 block w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${
    err ? 'border-red-400 focus:ring-red-200' : 'border-line focus:border-brand focus:ring-orange-200'
  }`;

// id của ô nhập = khoá lỗi (vd "leader.email") để cuộn tới ô lỗi đầu tiên
function Field({
  id,
  label,
  error,
  hint,
  required,
  ...props
}: { id: string; label: string; error?: string; hint?: string; required?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input id={id} name={id} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} className={inputClass(error)} {...props} />
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-xs text-red-600">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>
      )}
    </div>
  );
}

function Card({ icon: Icon, title, children, aside }: { icon: typeof Users; title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-brand-dark">
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="text-lg font-bold">{title}</h2>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export default function Register() {
  const [form, setForm] = useState<RegisterForm>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [done, setDone] = useState<{ teamName: string; email: string } | null>(null);

  // Sau lần bấm Đăng ký đầu tiên, kiểm tra lại ngay khi người dùng sửa
  useEffect(() => {
    if (submitted) setErrors(validateRegister(form));
  }, [form, submitted]);
  const update = (fn: (f: RegisterForm) => RegisterForm) => setForm(fn);
  const setTop = (k: 'teamName' | 'school') => (v: string) => update((f) => ({ ...f, [k]: v }));
  const setLeader = (k: keyof RegisterForm['leader']) => (v: string) => update((f) => ({ ...f, leader: { ...f.leader, [k]: v } }));
  const setMember = (i: number, k: keyof MemberForm) => (v: string) =>
    update((f) => ({ ...f, members: f.members.map((m, j) => (j === i ? { ...m, [k]: v } : m)) }));
  const addMember = () => update((f) => (f.members.length >= MAX_EXTRA_MEMBERS ? f : { ...f, members: [...f.members, emptyMember()] }));
  const removeMember = (i: number) => update((f) => ({ ...f, members: f.members.filter((_, j) => j !== i) }));

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setSubmitted(true);
    setServerError('');
    const errs = validateRegister(form);
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    setLoading(true);
    try {
      const res = await registerTeam(toRegisterInput(form));
      if (res.ok) setDone({ teamName: form.teamName.trim(), email: form.leader.email.trim() });
      else setServerError(res.error || 'Đăng ký không thành công, vui lòng thử lại.');
    } catch {
      setServerError('Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <>
        <PageHeader eyebrow="Đăng ký" title="Đăng ký thành công!" />
        <div className="mx-auto max-w-xl px-4 py-14 text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-green-600" />
          <h2 className="mt-4 text-2xl font-bold">Đội “{done.teamName}” đã được ghi nhận</h2>
          <p className="mt-3 text-ink-soft">
            Tài khoản trưởng nhóm: <strong>{done.email}</strong>. Hãy kiểm tra hộp thư (nếu có email xác nhận). Đội ở trạng
            thái <strong>chờ BTC duyệt</strong> — trong lúc chờ, cả đội có thể bắt đầu luyện tập.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/dang-nhap" className="rounded-lg bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-dark">Đăng nhập</Link>
            <Link to="/mo-phong" className="rounded-lg border border-line px-5 py-3 font-semibold hover:bg-surface-2">Vào trình mô phỏng</Link>
          </div>
        </div>
      </>
    );
  }

  const memberCount = 1 + form.members.filter((m) => m.fullName.trim()).length;

  return (
    <>
      <PageHeader eyebrow="Đăng ký" title="Đăng ký đội thi">
        Trưởng nhóm điền thông tin đội và tạo tài khoản. Mỗi đội tối đa 5 người (trưởng nhóm + 4 thành viên).
      </PageHeader>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <form noValidate onSubmit={onSubmit} className="space-y-6">
          <Card icon={Users} title="Thông tin đội">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="teamName" label="Tên đội" required maxLength={80} value={form.teamName}
                onChange={(e) => setTop('teamName')(e.target.value)} error={errors.teamName} placeholder="VD: Thăng Bằng 01" />
              <Field id="school" label="Trường" required maxLength={80} value={form.school}
                onChange={(e) => setTop('school')(e.target.value)} error={errors.school} placeholder="VD: THPT chuyên ..." />
            </div>
          </Card>

          <Card icon={UserRound} title="Trưởng nhóm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field id="leader.fullName" label="Họ và tên" required autoComplete="name" value={form.leader.fullName}
                  onChange={(e) => setLeader('fullName')(e.target.value)} error={errors['leader.fullName']} />
              </div>
              <Field id="leader.email" label="Email" type="email" required autoComplete="email" value={form.leader.email}
                onChange={(e) => setLeader('email')(e.target.value)} error={errors['leader.email']} hint="Dùng để đăng nhập." />
              <Field id="leader.phone" label="Số điện thoại" type="tel" required autoComplete="tel" value={form.leader.phone}
                onChange={(e) => setLeader('phone')(e.target.value)} error={errors['leader.phone']} placeholder="0912 345 678" />
              <div className="relative">
                <Field id="leader.password" label="Mật khẩu" type={showPw ? 'text' : 'password'} required autoComplete="new-password"
                  value={form.leader.password} onChange={(e) => setLeader('password')(e.target.value)}
                  error={errors['leader.password']} hint="Ít nhất 8 ký tự, có cả chữ và số." />
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="absolute right-2 top-7 rounded p-1.5 text-ink-soft hover:text-ink">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Field id="leader.confirmPassword" label="Nhập lại mật khẩu" type={showPw ? 'text' : 'password'} required
                autoComplete="new-password" value={form.leader.confirmPassword}
                onChange={(e) => setLeader('confirmPassword')(e.target.value)} error={errors['leader.confirmPassword']} />
            </div>
          </Card>

          <Card
            icon={Users}
            title="Thành viên khác"
            aside={<span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-ink-soft">{memberCount}/5 người</span>}
          >
            <p className="-mt-2 mb-4 text-sm text-ink-soft">
              Tối đa {MAX_EXTRA_MEMBERS} thành viên. Dòng để trống sẽ được bỏ qua. Số điện thoại thành viên không bắt buộc.
            </p>
            {errors.members && <p className="mb-3 text-sm text-red-600">{errors.members}</p>}
            <div className="space-y-4">
              {form.members.map((m, i) => {
                const p = `members.${i}`;
                return (
                  <fieldset key={i} className="rounded-xl border border-line bg-surface-2/60 p-4">
                    <legend className="sr-only">Thành viên {i + 1}</legend>
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-semibold">Thành viên {i + 1}</span>
                      <button type="button" onClick={() => removeMember(i)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" /> Xoá
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field id={`${p}.fullName`} label="Họ và tên" required value={m.fullName}
                        onChange={(e) => setMember(i, 'fullName')(e.target.value)} error={errors[`${p}.fullName`]} />
                      <div>
                        <label htmlFor={`${p}.roleInTeam`} className="block text-sm font-medium">Vai trò trong đội</label>
                        <select id={`${p}.roleInTeam`} value={m.roleInTeam} onChange={(e) => setMember(i, 'roleInTeam')(e.target.value)}
                          className={inputClass()}>
                          {ROLES_IN_TEAM.map((r) => <option key={r}>{r}</option>)}
                        </select>
                      </div>
                      <Field id={`${p}.email`} label="Email" type="email" required value={m.email}
                        onChange={(e) => setMember(i, 'email')(e.target.value)} error={errors[`${p}.email`]} />
                      <Field id={`${p}.phone`} label="Số điện thoại" type="tel" value={m.phone}
                        onChange={(e) => setMember(i, 'phone')(e.target.value)} error={errors[`${p}.phone`]} />
                    </div>
                  </fieldset>
                );
              })}
            </div>
            {form.members.length < MAX_EXTRA_MEMBERS && (
              <button type="button" onClick={addMember}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-dashed border-brand px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-orange-50">
                <Plus className="h-4 w-4" /> Thêm thành viên
              </button>
            )}
          </Card>

          <div>
            <label className="flex items-start gap-3 text-sm">
              <input id="agree" type="checkbox" checked={form.agree}
                onChange={(e) => update((f) => ({ ...f, agree: e.target.checked }))}
                className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
              <span>
                Tôi đã đọc và đồng ý với{' '}
                <Link to="/the-le" target="_blank" className="font-semibold text-brand-dark underline">thể lệ cuộc thi</Link>; thông tin
                trên là chính xác.
              </span>
            </label>
            {errors.agree && <p className="mt-1 text-xs text-red-600">{errors.agree}</p>}
          </div>

          {submitted && Object.keys(errors).length > 0 && (
            <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              Còn {Object.keys(errors).length} mục chưa hợp lệ, vui lòng kiểm tra các ô được đánh dấu đỏ.
            </p>
          )}
          {serverError && (
            <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</p>
          )}

          <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-center text-sm text-ink-soft sm:text-left">
              Đã có tài khoản? <Link to="/dang-nhap" className="font-semibold text-brand-dark underline">Đăng nhập</Link>
            </p>
            <button type="submit" disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-6 py-3 font-semibold text-white shadow-sm hover:bg-brand-dark disabled:opacity-60">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Đang gửi...' : 'Đăng ký đội'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
