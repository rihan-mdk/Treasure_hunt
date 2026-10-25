import Link from "next/link";
import type { Metadata } from "next";
import { Compass, Radar, ArrowRight, BookOpen } from "lucide-react";
import { BottomNav } from "@/components/navigation/BottomNav";
import { StatusBadge } from "@/components/common/StatusBadge";

export const metadata: Metadata = {
  title: "The Hunt Expedition — Decode. Follow. Find.",
  description:
    "A collegiate mystery trail of 45 cipher challenges across 5 levels. Decode secrets, follow the trail, and claim the hidden treasure.",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#050505] text-[#F5F3F7] flex flex-col justify-between">
      {/* Top Header */}
      <header className="fixed top-0 inset-x-0 z-50 bg-[#110B18]/95 backdrop-blur-xl border-b border-white/[0.06]">
        <div
          className="h-14 px-4 flex items-center justify-between"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#3B0A6B]/50 border border-[#3B0A6B] flex items-center justify-center">
              <Compass size={18} className="text-[#00E5FF]" />
            </div>
            <span
              className="font-bold uppercase tracking-widest text-sm text-[#F5F3F7]"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              THE HUNT
            </span>
          </div>
          <StatusBadge status="active" showDot>
            LIVE SEASON
          </StatusBadge>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col pt-20 pb-24 px-5 relative overflow-hidden">
        {/* Subtle Ambient Background */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-[#3B0A6B]/25 blur-3xl" />
          <div className="absolute bottom-1/4 right-0 w-60 h-60 rounded-full bg-[#00E5FF]/10 blur-3xl" />
        </div>

        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full py-6">
          {/* Tag */}
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-[#00E5FF] animate-pulse" />
            <span
              className="text-[11px] uppercase tracking-widest text-[#00E5FF] font-semibold"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              COLLEGIATE CIPHER QUEST
            </span>
          </div>

          {/* Hero Typography */}
          <h1
            className="text-4xl sm:text-5xl font-bold tracking-tight text-[#F5F3F7] leading-[1.1] mb-4"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            Every clue <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#F5F3F7] via-[#dab9ff] to-[#00E5FF]">
              leads somewhere.
            </span>
          </h1>

          <p className="text-[15px] leading-relaxed text-[#A8A1B0] mb-8">
            Decode cryptic transmissions, uncover physical campus checkpoints, and race against other squads to claim the prize.
          </p>

          {/* Active Beacon Card */}
          <div className="mb-8 p-4 rounded-2xl bg-[#110B18] border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.4)] flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#3B0A6B]/40 border border-[#3B0A6B] flex items-center justify-center shrink-0">
                <Radar size={20} className="text-[#00E5FF] animate-spin" style={{ animationDuration: "10s" }} />
              </div>
              <div>
                <p
                  className="text-[10px] text-[#00E5FF] uppercase tracking-wider font-semibold"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  EXPEDITION STATUS
                </p>
                <p
                  className="text-sm font-semibold text-[#F5F3F7]"
                  style={{ fontFamily: "var(--font-space-grotesk)" }}
                >
                  5 Levels · 45 Challenges
                </p>
              </div>
            </div>
            <span
              className="text-xs px-2.5 py-1 rounded-full bg-[#10B981]/15 text-[#10B981] font-semibold border border-[#10B981]/30"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              ONLINE
            </span>
          </div>

          {/* CTAs */}
          <div className="flex flex-col gap-3">
            <Link
              href="/login"
              id="startExpeditionBtn"
              className="group h-[52px] rounded-xl bg-[#00E5FF] text-[#050505] font-semibold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(0,229,255,0.3)] hover:bg-[#38ecff] hover:shadow-[0_0_32px_rgba(0,229,255,0.45)] active:scale-[0.98] transition-all"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              <span>Start Expedition</span>
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link
              href="/field-guide"
              className="h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[#A8A1B0] hover:text-[#F5F3F7] hover:bg-white/[0.07] text-[13px] font-medium flex items-center justify-center gap-2 transition-all"
            >
              <BookOpen size={16} />
              <span>How To Play & Field Guide</span>
            </Link>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
