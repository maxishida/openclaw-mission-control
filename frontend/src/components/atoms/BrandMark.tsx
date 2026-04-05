type BrandMarkProps = {
  subtitle?: string;
  tileLabel?: string;
  title?: string;
  variant?: "openclaw" | "prompthub";
};

export function BrandMark({
  subtitle = "Mission Control",
  tileLabel = "OC",
  title = "OPENCLAW",
  variant = "openclaw",
}: BrandMarkProps) {
  const tileClass =
    variant === "prompthub"
      ? "bg-[linear-gradient(135deg,#5b1aa8_0%,#7c2cff_45%,#d24dff_100%)] shadow-[0_0_28px_rgba(162,59,255,0.35)]"
      : "bg-gradient-to-br from-blue-600 to-blue-700 shadow-sm";
  const titleClass = variant === "prompthub" ? "text-fuchsia-50" : "text-strong";
  const subtitleClass = variant === "prompthub" ? "text-fuchsia-200/80" : "text-quiet";

  return (
    <div className="flex items-center gap-3">
      <div
        className={`grid h-10 w-10 place-items-center rounded-lg text-xs font-semibold text-white ${tileClass}`}
      >
        <span className="font-heading tracking-[0.2em]">{tileLabel}</span>
      </div>
      <div className="leading-tight">
        <div className={`font-heading text-sm uppercase tracking-[0.26em] ${titleClass}`}>
          {title}
        </div>
        <div className={`text-[11px] font-medium ${subtitleClass}`}>{subtitle}</div>
      </div>
    </div>
  );
}
