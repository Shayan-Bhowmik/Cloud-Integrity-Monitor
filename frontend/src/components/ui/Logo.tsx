export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#121A33" stroke="#243052" />
      <rect x="7.5" y="7.5" width="17" height="17" rx="3" fill="none" stroke="#22D3EE" strokeWidth="1.8" />
      <circle cx="16" cy="16" r="4.2" fill="none" stroke="#34D399" strokeWidth="1.8" />
      <path d="M16 11.8V10M16 22v-1.8M11.8 16H10M22 16h-1.8" stroke="#34D399" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span className="font-display text-lg font-semibold tracking-tight text-text">Cairn</span>
    </span>
  );
}
