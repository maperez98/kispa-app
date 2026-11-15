import { BRAND } from "@/lib/brand";

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#ff5a1f" />
      <path
        d="M16.6 24c-3.9 0-6.6-2.6-6.6-6.3 0-2.4 1.2-4.3 2.7-5.9.3 1.5 1.2 2.6 2.4 3.2-.3-3.4 1.2-6.6 4.1-8.6-.4 2.3.5 3.9 1.9 5.2 1.5 1.4 2.5 3 2.5 5 0 3.6-2.6 6.4-7 6.4z"
        fill="#0a0a0c"
      />
    </svg>
  );
}

export function Logo({ size = 28, withWord = true }: { size?: number; withWord?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      {withWord && (
        <span className="font-display text-[1.35rem] font-700 font-bold leading-none tracking-tight">
          {BRAND.name.toLowerCase()}
        </span>
      )}
    </span>
  );
}
