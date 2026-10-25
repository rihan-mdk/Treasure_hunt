"use client";

import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

interface TopBarProps {
  title?: string;
  showBack?: boolean;
  backHref?: string;
  rightSlot?: React.ReactNode;
  showTeamBadge?: boolean;
  teamCallsign?: string;
}

export function TopBar({
  title,
  showBack = false,
  backHref = "/",
  rightSlot,
  showTeamBadge = false,
  teamCallsign,
}: TopBarProps) {
  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-[#110B18]/95 backdrop-blur-xl border-b border-white/[0.06]">
      <div
        className="h-14 px-4 flex items-center justify-between gap-3"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {showBack ? (
            <Link
              href={backHref}
              className="flex items-center justify-center w-9 h-9 rounded-xl text-[#A8A1B0] hover:text-[#F5F3F7] hover:bg-white/[0.06] transition-colors -ml-1 shrink-0 min-h-[44px] min-w-[44px]"
              aria-label="Go back"
            >
              <ArrowLeft size={20} strokeWidth={1.75} />
            </Link>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <Compass size={18} className="text-[#00E5FF]" strokeWidth={1.75} />
              <span className="font-semibold text-sm tracking-widest uppercase text-[#F5F3F7]"
                style={{ fontFamily: "var(--font-space-grotesk)" }}>
                THE HUNT
              </span>
            </div>
          )}
          {title && (
            <span className="font-semibold text-[#F5F3F7] text-[15px] truncate"
              style={{ fontFamily: "var(--font-space-grotesk)" }}>
              {title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {showTeamBadge && teamCallsign && (
            <span className="flex items-center gap-1.5 px-2.5 h-7 rounded-full bg-[#3B0A6B]/40 border border-[#3B0A6B]/60">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-pulse shrink-0" />
              <span className="text-[10px] text-[#00E5FF] uppercase tracking-wider font-semibold truncate max-w-[110px]"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                {teamCallsign}
              </span>
            </span>
          )}
          {rightSlot}
        </div>
      </div>
    </header>
  );
}
