import React from "react";

interface StatusBadgeProps {
  status: "active" | "completed" | "locked" | "verified" | "error";
  children?: React.ReactNode;
  showDot?: boolean;
}

export function StatusBadge({ status, children, showDot = false }: StatusBadgeProps) {
  const styles = {
    active: "bg-[#00E5FF]/10 border-[#00E5FF]/25 text-[#00E5FF]",
    completed: "bg-[#10B981]/10 border-[#10B981]/25 text-[#10B981]",
    locked: "bg-white/[0.05] border-white/[0.08] text-[#A8A1B0]",
    verified: "bg-[#10B981]/10 border-[#10B981]/25 text-[#10B981]",
    error: "bg-[#EF4444]/10 border-[#EF4444]/25 text-[#f87171]",
  };

  const dotColors = {
    active: "bg-[#00E5FF] animate-pulse",
    completed: "bg-[#10B981]",
    locked: "bg-[#A8A1B0]",
    verified: "bg-[#10B981]",
    error: "bg-[#EF4444]",
  };

  const labels = {
    active: children ?? "ACTIVE",
    completed: children ?? "CLEARED",
    locked: children ?? "LOCKED",
    verified: children ?? "VERIFIED",
    error: children ?? "ERROR",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border text-[10px] font-semibold tracking-wider ${styles[status]}`}
      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
    >
      {showDot && (
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColors[status]}`} />
      )}
      {labels[status]}
    </span>
  );
}
