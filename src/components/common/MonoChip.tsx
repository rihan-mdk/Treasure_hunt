import React from "react";

interface MonoChipProps {
  children: React.ReactNode;
  variant?: "active" | "muted" | "success" | "error" | "amethyst";
  dotPulse?: boolean;
  className?: string;
}

export function MonoChip({
  children,
  variant = "active",
  dotPulse = false,
  className = "",
}: MonoChipProps) {
  const variantStyles = {
    active: "bg-[#3B0A6B]/35 border-[#00E5FF]/30 text-[#00E5FF]",
    muted: "bg-[#29232F]/40 border-[#29232F]/60 text-[#777783]",
    success: "bg-[#10B981]/15 border-[#10B981]/30 text-[#10B981]",
    error: "bg-[#EF4444]/15 border-[#EF4444]/30 text-[#EF4444]",
    amethyst: "bg-[#3B0A6B]/40 border-[#3B0A6B]/60 text-[#dab9ff]",
  };

  const dotColor = {
    active: "bg-[#00E5FF]",
    muted: "bg-[#777783]",
    success: "bg-[#10B981]",
    error: "bg-[#EF4444]",
    amethyst: "bg-[#dab9ff]",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[11px] font-600 tracking-[0.06em] uppercase leading-none ${variantStyles[variant]} ${className}`}
    >
      {dotPulse && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor[variant]} ${variant === "active" ? "animate-pulse" : ""}`}
        />
      )}
      {children}
    </span>
  );
}
