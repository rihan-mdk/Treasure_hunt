import type { Metadata } from "next";
import Link from "next/link";
import {
  Trophy,
  CheckCircle2,
  Users,
  HelpCircle,
  Layers,
  ShieldCheck,
  ArrowRight,
  Home,
  Clock,
} from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getWinnerAction } from "@/app/actions/gameActions";

export const metadata: Metadata = {
  title: "Winner Announcement — The Hunt Expedition",
  description:
    "See the verified winner of The Hunt Expedition — the team that decoded all ciphers and claimed the physical treasure.",
};

export const instant = false;

export default async function WinnerPage() {
  const winner = await getWinnerAction();

  // No winner yet — show waiting state
  if (!winner.event_completed || !winner.team_name) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#050505] text-[#F5F3F7] flex flex-col items-center justify-center px-4 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-8 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-[#3B0A6B]/15 blur-3xl" />
        </div>

        <div className="max-w-sm w-full text-center">
          <div className="flex items-center justify-center gap-2 mb-5">
            <StatusBadge status="active" showDot>
              EXPEDITION IN PROGRESS
            </StatusBadge>
          </div>

          <div className="w-20 h-20 rounded-2xl bg-[#3B0A6B]/30 border border-[#3B0A6B]/60 flex items-center justify-center mx-auto mb-5">
            <Clock size={36} className="text-[#A8A1B0] animate-pulse" />
          </div>

          <h1
            className="text-3xl font-bold tracking-tight text-[#F5F3F7] mb-2"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            No Winner Yet
          </h1>
          <p className="text-[14px] text-[#A8A1B0] mb-8">
            The expedition is still active. Teams are racing to decode all ciphers and claim the physical cache.
          </p>

          <Link
            href="/"
            className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-white/[0.04] border border-white/10 text-[#A8A1B0] hover:text-[#F5F3F7] hover:bg-white/[0.08] text-xs font-semibold uppercase tracking-wider transition-all"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            <Home size={15} />
            <span>Return Home</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#050505] text-[#F5F3F7] flex flex-col justify-between px-4 py-8 relative overflow-hidden">
      {/* Background illumination */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-8 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-[#00E5FF]/15 blur-3xl" />
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-[#3B0A6B]/30 blur-3xl" />
      </div>

      <div className="max-w-md mx-auto w-full flex-1 flex flex-col justify-between">
        {/* Top Winner Header */}
        <div className="flex flex-col items-center pt-2">
          {/* Status Badges */}
          <div className="flex items-center gap-2 mb-5">
            <StatusBadge status="verified" showDot>
              VERIFIED CHAMPION
            </StatusBadge>
            <span
              className="text-[10px] text-[#00E5FF] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#00E5FF]/10 border border-[#00E5FF]/20"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              {winner.callsign ?? "CHAMPION"}
            </span>
          </div>

          {/* Trophy Display */}
          <div className="relative mb-5">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-b from-[#3B0A6B]/60 to-[#140924] border border-[#00E5FF]/50 flex items-center justify-center shadow-[0_0_40px_rgba(0,229,255,0.25)]">
              <Trophy size={48} className="text-[#00E5FF]" />
            </div>
            <div className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-[#10B981] flex items-center justify-center text-black shadow-lg">
              <CheckCircle2 size={16} strokeWidth={2.5} />
            </div>
          </div>

          {/* Headline */}
          <h1
            className="text-3xl sm:text-4xl font-bold tracking-tight text-[#F5F3F7] text-center mb-1 leading-tight"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            The Treasure Is Claimed
          </h1>
          <p className="text-[14px] text-[#A8A1B0] text-center mb-6">
            Physical cache discovery officially confirmed by hunt marshals.
          </p>

          {/* Squad Badge Card */}
          <div className="w-full p-4 rounded-2xl bg-[#110B18] border border-white/[0.08] flex items-center gap-4 mb-6 shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
            <div className="w-12 h-12 rounded-xl bg-[#3B0A6B]/40 border border-[#3B0A6B]/60 flex items-center justify-center shrink-0 text-[#00E5FF]">
              <Users size={24} />
            </div>
            <div className="min-w-0">
              <p
                className="text-[10px] text-[#A8A1B0] uppercase tracking-wider font-semibold"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                WINNING SQUAD
              </p>
              <h2
                className="font-bold text-lg text-[#F5F3F7] truncate"
                style={{ fontFamily: "var(--font-space-grotesk)" }}
              >
                {winner.team_name}
              </h2>
              <p
                className="text-[11px] text-[#00E5FF] font-semibold tracking-wider"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                CALLSIGN: {winner.callsign ?? "—"}
              </p>
            </div>
          </div>

          {/* Expedition Record Grid */}
          <div className="w-full grid grid-cols-2 gap-2.5 mb-5">
            <div className="p-3.5 rounded-xl bg-[#110B18] border border-white/[0.07] flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[#00E5FF]">
                <HelpCircle size={15} />
                <span
                  className="text-[10px] uppercase tracking-wider text-[#A8A1B0]"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  Questions
                </span>
              </div>
              <span
                className="text-base font-bold text-[#F5F3F7]"
                style={{ fontFamily: "var(--font-space-grotesk)" }}
              >
                45/45
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#110B18] border border-white/[0.07] flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[#dab9ff]">
                <Layers size={15} />
                <span
                  className="text-[10px] uppercase tracking-wider text-[#A8A1B0]"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  Sectors
                </span>
              </div>
              <span
                className="text-base font-bold text-[#F5F3F7]"
                style={{ fontFamily: "var(--font-space-grotesk)" }}
              >
                5/5 Cleared
              </span>
            </div>

            <div className="col-span-2 p-3.5 rounded-xl bg-[#110B18] border border-white/[0.07] flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[#10B981]">
                <CheckCircle2 size={15} />
                <span
                  className="text-[10px] uppercase tracking-wider text-[#A8A1B0]"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  Verified At
                </span>
              </div>
              <span
                className="text-base font-bold text-[#F5F3F7]"
                style={{ fontFamily: "var(--font-space-grotesk)" }}
              >
                {winner.won_at
                  ? new Date(winner.won_at).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "Confirmed"}
              </span>
            </div>
          </div>

          {/* Official Verification Seal */}
          <div className="w-full p-3.5 rounded-xl bg-[#10B981]/10 border border-[#10B981]/25 flex items-center gap-3">
            <ShieldCheck size={20} className="text-[#10B981] shrink-0" />
            <div>
              <p
                className="text-[11px] text-[#10B981] uppercase tracking-wider font-semibold"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                OFFICIAL MARSHAL VERIFICATION
              </p>
              <p className="text-[12px] text-[#A8A1B0]">
                Cache registration confirmed. First-place placement recorded.
              </p>
            </div>
          </div>
        </div>

        {/* Action CTAs */}
        <div className="flex flex-col gap-2.5 mt-6">
          <Link
            href="/dashboard"
            className="group w-full h-12 rounded-xl bg-[#00E5FF] text-[#050505] font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,229,255,0.3)] hover:bg-[#38ecff] transition-all"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            <span>Review Full Expedition Log</span>
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            href="/"
            className="w-full h-11 rounded-xl bg-white/[0.04] border border-white/10 text-[#A8A1B0] hover:text-[#F5F3F7] hover:bg-white/[0.08] text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            <Home size={15} />
            <span>Return to Expedition Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
