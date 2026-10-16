import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LogIn, Mail, KeyRound, UserPlus, LogOut, Users, ShieldCheck } from 'lucide-react';
import { useAuth, clearRecovery } from '@/lib/useAuth';
import { useMyTeam } from '@/lib/useMyTeam';
import { sendPasswordReset, signInWithMagicLink, signInWithPassword, signUpMember, updatePassword } from '@/lib/api';
import { friendlyError, isEmail } from '@/lib/format';

type Mode = 'login' | 'magic' | 'signup' | 'forgot' | 'reset';

const TABS: { mode: Mode; label: string }[] = [
  { mode: 'login', label: 'Mật khẩu' },
  { mode: 'magic', label: 'Link qua email' },
  { mode: 'signup', label: 'Thành viên mới' },
];

export default function Login() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next');
  const wantsReset = params.has('dat-lai');
  const [mode, setMode] = useState<Mode>(wantsReset ? 'forgot' : 'login');
  // Link trong email lỗi/hết hạn: Supabase trả error_description trên query hoặc hash
  const [linkError] = useState(() => readLinkError());

  useEffect(() => {
    if ((auth.recovery || wantsReset) && auth.session) setMode('reset');
  }, [auth.recovery, wantsReset, auth.session]);

  // Đăng nhập xong mà có ?next= thì chuyển tiếp
  useEffect(() => {
    if (auth.session && next && mode !== 'reset' && !auth.recovery) navigate(next, { replace: true });
  }, [auth.session, next, mode, auth.recovery, navigate]);

  if (auth.loading) {
    return <Shell><p className="text-ink-soft">Đang tải…</p></Shell>;
  }
  if (mode === 'reset') {
    return <Shell title="Đặt mật khẩu mới"><ResetForm onDone={() => { clearRecovery(); setMode('login'); navigate('/dang-nhap', { replace: true }); }} /></Shell>;
  }
  if (auth.session) {
    return <Shell title="Tài khoản"><SignedIn /></Shell>;
  }

  return (
    <Shell title="Đăng nhập">
      <Msg kind="error" text={linkError} />
      {mode !== 'forgot' && (
        <div className="mb-6 grid grid-cols-3 rounded-lg bg-surface-2 p-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t.mode}
              type="button"
              onClick={() => setMode(t.mode)}
              className={`rounded-md px-2 py-1.5 font-medium ${mode === t.mode ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {mode === 'login' && <PasswordForm onForgot={() => setMode('forgot')} />}
      {mode === 'magic' && <MagicForm />}
      {mode === 'signup' && <SignupForm />}
      {mode === 'forgot' && <ForgotForm onBack={() => setMode('login')} />}
      <p className="mt-8 text-center text-sm text-ink-soft">
        Chưa có đội? <Link to="/dang-ky" className="font-semibold text-brand-dark">Đăng ký đội</Link>
      </p>
    </Shell>
  );
}

function readLinkError(): string | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const code = q.get('error_code') ?? h.get('error_code');
  const desc = q.get('error_description') ?? h.get('error_description');
  if (!code && !desc) return null;
  if (code === 'otp_expired' || /expired|invalid/i.test(desc ?? '')) {
    return 'Link trong email đã hết hạn hoặc đã được dùng. Hãy yêu cầu gửi link mới.';
  }
  return friendlyError(desc ?? code);
}

// ---------------------------------------------------------------- Khung & phần tử chung

function Shell({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      {title && <h1 className="mb-6 text-2xl font-bold text-ink">{title}</h1>}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">{children}</div>
    </div>
  );
}

function Field(props: { label: string; type?: string; value: string; onChange: (v: string) => void; autoComplete?: string; placeholder?: string }) {
  return (
    <label className="mb-4 block text-sm">
      <span className="mb-1 block font-medium text-ink">{props.label}</span>
      <input
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        required
        className="w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </label>
  );
}

function Submit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
    >
      {busy ? 'Đang xử lý…' : children}
    </button>
  );
}

function Msg({ kind, text }: { kind: 'error' | 'ok'; text: string | null }) {
  if (!text) return null;
  return (
    <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${kind === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>{text}</p>
  );
}

function useAsyncForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okText, setOkText] = useState<string | null>(null);
  async function run(fn: () => Promise<{ ok: boolean; error?: string } | void>, success?: string) {
    setBusy(true);
    setError(null);
    setOkText(null);
    const r = await fn();
    setBusy(false);
    if (r && !r.ok) setError(r.error ?? 'Đã có lỗi xảy ra');
    else if (success) setOkText(success);
  }
  return { busy, error, okText, setError, run };
}

// ---------------------------------------------------------------- Các form

function PasswordForm({ onForgot }: { onForgot: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const f = useAsyncForm();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void f.run(() => signInWithPassword(email, password));
  };
  return (
    <form onSubmit={submit}>
      <Msg kind="error" text={f.error} />
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Field label="Mật khẩu" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
      <div className="-mt-2 mb-4 text-right">
        <button type="button" onClick={onForgot} className="text-sm text-brand-dark hover:underline">Quên mật khẩu?</button>
      </div>
      <Submit busy={f.busy}><LogIn size={18} /> Đăng nhập</Submit>
    </form>
  );
}

function MagicForm() {
  const [email, setEmail] = useState('');
  const f = useAsyncForm();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isEmail(email)) return f.setError('Email không hợp lệ');
    void f.run(() => signInWithMagicLink(email), 'Đã gửi link đăng nhập. Mở email và bấm vào link để vào trang.');
  };
  return (
    <form onSubmit={submit}>
      <p className="mb-4 text-sm text-ink-soft">Không cần mật khẩu: nhập email, bấm link trong thư là đăng nhập được. Thành viên được trưởng nhóm khai báo email sẽ tự vào đội.</p>
      <Msg kind="error" text={f.error} />
      <Msg kind="ok" text={f.okText} />
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Submit busy={f.busy}><Mail size={18} /> Gửi link đăng nhập</Submit>
    </form>
  );
}

function SignupForm() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const f = useAsyncForm();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return f.setError('Mật khẩu cần ít nhất 6 ký tự');
    void f.run(() => signUpMember(email, password, fullName), 'Đã tạo tài khoản. Nếu được yêu cầu, hãy mở email để xác nhận rồi đăng nhập.');
  };
  return (
    <form onSubmit={submit}>
      <p className="mb-4 text-sm text-ink-soft">
        Dành cho <b>thành viên</b> đã được trưởng nhóm khai báo khi đăng ký đội. Dùng <b>đúng email</b> trưởng nhóm đã điền — tài khoản sẽ tự vào đội.
      </p>
      <Msg kind="error" text={f.error} />
      <Msg kind="ok" text={f.okText} />
      <Field label="Họ và tên" value={fullName} onChange={setFullName} autoComplete="name" />
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Field label="Mật khẩu (≥ 6 ký tự)" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
      <Submit busy={f.busy}><UserPlus size={18} /> Tạo tài khoản</Submit>
    </form>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const f = useAsyncForm();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isEmail(email)) return f.setError('Email không hợp lệ');
    void f.run(() => sendPasswordReset(email), 'Nếu email có tài khoản, thư hướng dẫn đặt lại mật khẩu đã được gửi.');
  };
  return (
    <form onSubmit={submit}>
      <h2 className="mb-2 text-lg font-semibold">Quên mật khẩu</h2>
      <p className="mb-4 text-sm text-ink-soft">Nhập email tài khoản, chúng tôi sẽ gửi link để đặt mật khẩu mới.</p>
      <Msg kind="error" text={f.error} />
      <Msg kind="ok" text={f.okText} />
      <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
      <Submit busy={f.busy}><KeyRound size={18} /> Gửi link đặt lại</Submit>
      <button type="button" onClick={onBack} className="mt-4 w-full text-sm text-ink-soft hover:underline">← Quay lại đăng nhập</button>
    </form>
  );
}

function ResetForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const f = useAsyncForm();
  const [done, setDone] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return f.setError('Mật khẩu cần ít nhất 6 ký tự');
    if (password !== confirm) return f.setError('Hai mật khẩu không khớp');
    void f.run(async () => {
      const r = await updatePassword(password);
      if (r.ok) setDone(true);
      return r;
    });
  };
  if (done) {
    return (
      <div>
        <Msg kind="ok" text="Đã đổi mật khẩu thành công." />
        <button onClick={onDone} className="w-full rounded-lg bg-brand px-4 py-2.5 font-semibold text-white">Tiếp tục</button>
      </div>
    );
  }
  return (
    <form onSubmit={submit}>
      <Msg kind="error" text={f.error} />
      <Field label="Mật khẩu mới" type="password" value={password} onChange={setPassword} autoComplete="new-password" />
      <Field label="Nhập lại mật khẩu" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
      <Submit busy={f.busy}><KeyRound size={18} /> Lưu mật khẩu</Submit>
    </form>
  );
}

function SignedIn() {
  const auth = useAuth();
  const my = useMyTeam();
  return (
    <div>
      <p className="text-sm text-ink-soft">Đang đăng nhập với</p>
      <p className="mb-4 font-semibold text-ink">{auth.profile?.fullName || auth.user?.email}</p>
      <p className="-mt-3 mb-5 text-sm text-ink-soft">{auth.user?.email}</p>
      {my.loading ? (
        <p className="mb-4 text-sm text-ink-soft">Đang tải thông tin đội…</p>
      ) : my.team ? (
        <div className="mb-5 rounded-lg bg-surface-2 p-3 text-sm">
          <div className="font-semibold">{my.team.name}</div>
          <div className="text-ink-soft">{my.team.school} · {my.members.length} thành viên · {STATUS[my.team.status]}</div>
        </div>
      ) : (
        <p className="mb-5 rounded-lg bg-surface-2 p-3 text-sm text-ink-soft">
          Tài khoản chưa thuộc đội nào. Nếu bạn là thành viên, nhờ trưởng nhóm kiểm tra lại email đã khai báo.
        </p>
      )}
      <div className="flex flex-col gap-2">
        {my.team && (
          <Link to="/mo-phong/doi" className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark">
            <Users size={18} /> Vào không gian làm việc của đội
          </Link>
        )}
        {auth.isAdmin && (
          <Link to="/btc" className="flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-2.5 font-semibold">
            <ShieldCheck size={18} /> Trang BTC
          </Link>
        )}
        <button onClick={() => void auth.signOut()} className="flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-ink-soft hover:bg-surface-2">
          <LogOut size={18} /> Đăng xuất
        </button>
      </div>
    </div>
  );
}

const STATUS = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Bị từ chối' } as const;
