import { Link } from 'react-router-dom';

// Logo ProBike: biểu tượng xe hai bánh thẳng hàng + bánh đà ở giữa.
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--color-brand)" />
      <circle cx="8.5" cy="21" r="4.5" fill="none" stroke="#fff" strokeWidth="2" />
      <circle cx="23.5" cy="21" r="4.5" fill="none" stroke="#fff" strokeWidth="2" />
      <path d="M8.5 21 L14 12 L21 12 L23.5 21" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="16" cy="15" r="3" fill="#fff" />
      <circle cx="16" cy="15" r="1" fill="var(--color-brand)" />
    </svg>
  );
}

export default function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="ProBike — về trang chủ">
      <LogoMark />
      <span className={`text-lg font-extrabold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>
        Pro<span className="text-brand">Bike</span>
      </span>
    </Link>
  );
}
