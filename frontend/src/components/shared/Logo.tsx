import { BRAND } from "@/lib/brand";

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center rounded-xl bg-brand-gradient shadow-card" style={{ width: size, height: size }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 32 32" fill="none">
        <path d="M6 22a10 10 0 0 1 20 0" stroke="white" strokeWidth="3" strokeLinecap="round" />
        <path d="M11 22a5 5 0 0 1 10 0" stroke="white" strokeOpacity="0.75" strokeWidth="3" strokeLinecap="round" />
        <circle cx="16" cy="22" r="2" fill="white" />
        <path d="M16 3v4M5.5 8.5l2.8 2.8M26.5 8.5l-2.8 2.8" stroke="white" strokeOpacity="0.8" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export function Logo({ light, subtitle }: { light?: boolean; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-tight">
        <p className={`text-[17px] font-semibold tracking-tight ${light ? "text-white" : "text-ink"}`}>
          {BRAND.name}
          <span className={light ? "text-white/70" : "text-brand2"}> {BRAND.suffix}</span>
        </p>
        {subtitle && <p className={`text-[11px] ${light ? "text-white/60" : "text-muted"}`}>{subtitle}</p>}
      </div>
    </div>
  );
}
