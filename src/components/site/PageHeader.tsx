import type { ReactNode } from 'react';

// Dải tiêu đề đầu các trang con (Thể lệ, Giải thưởng, Đăng ký).
export default function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-ink text-white">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/30 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:py-16">
        {eyebrow && <p className="text-sm font-semibold uppercase tracking-wider text-orange-300">{eyebrow}</p>}
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {children && <div className="mt-3 max-w-2xl text-slate-300">{children}</div>}
      </div>
    </section>
  );
}

// Tiêu đề một khối nội dung trên trang chủ.
export function SectionTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-2xl">
      {eyebrow && <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">{eyebrow}</p>}
      <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h2>
      {children && <p className="mt-3 text-ink-soft">{children}</p>}
    </div>
  );
}
