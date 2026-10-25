import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Award, Check, Star, HelpCircle, Lightbulb, ArrowRight, Radar } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getAuthenticatedTeam } from "@/lib/server/authGuard";
import { getTeamProgressAction } from "@/app/actions/progressActions";

export const metadata: Metadata = {
  title: "Sector Cleared — Level Complete | The Hunt",
  description: "You have completed this level. The next expedition sector is now unlocked.",
};

export const instant = false;

export default async function LevelCompletePage() {
  // Server-side auth guard
  const teamCtx = await getAuthenticatedTeam();
  if (!teamCtx) {
    redirect("/login");
  }

  const progress = await getTeamProgressAction();

  if (!progress.success || !progress.levels) {
    redirect("/dashboard");
  }

  // Find the most recently completed level (last completed before first active/locked)
  const levels = progress.levels;
  let completedLevel = levels[0];
  let nextLevel = levels.length > 1 ? levels[1] : null;

  for (let i = levels.length - 1; i >= 0; i--) {
    if (levels[i].status === "completed") {
      completedLevel = levels[i];
      nextLevel = i + 1 < levels.length ? levels[i + 1] : null;
      break;
    }
  }

  // If no level is completed, redirect back to dashboard
  if (completedLevel.status !== "completed") {
    redirect("/dashboard");
  }

  const hintsUsed = completedLevel.hintsUsed;
  // Star rating: 3 stars = 0 hints, 2 stars = 1 hint, 1 star = 2+ hints
  const earned = hintsUsed === 0 ? 3 : hintsUsed === 1 ? 2 : 1;
  const stars = [1, 2, 3];

  const allComplete = progress.completedAllLevels;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#050505] text-[#F5F3F7] flex flex-col justify-between px-4 py-8 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-12 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-[#3B0A6B]/30 blur-3xl" />
        <div className="absolute bottom-12 right-6 w-60 h-60 rounded-full bg-[#00E5FF]/10 blur-3xl" />
      </div>

      <div className="max-w-md mx-auto w-full flex-1 flex flex-col justify-between">
        {/* Header section */}
        <div className="flex flex-col items-center pt-2">
          {/* Status Badge */}
          <div className="flex items-center gap-2 mb-4">
            <StatusBadge status="completed" showDot>
              LEVEL {completedLevel.levelNumber} CLEARED
            </StatusBadge>
            <span
              className="text-[10px] text-[#A8A1B0] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              {completedLevel.codename}
            </span>
          </div>

          {/* Trophy Emblem */}
          <div className="relative mb-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-b from-[#3B0A6B]/50 to-[#140924] border border-[#3B0A6B] flex items-center justify-center shadow-[0_0_36px_rgba(59,10,107,0.5)]">
              <Award size={38} className="text-[#00E5FF]" />
            </div>
            <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-[#10B981] flex items-center justify-center text-black shadow-md">
              <Check size={14} strokeWidth={3} />
            </div>
          </div>

          {/* Headline */}
          <h1
            className="text-3xl font-bold tracking-tight text-[#F5F3F7] text-center mb-1"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            Sector Mastered
          </h1>
          <p className="text-[14px] text-[#A8A1B0] text-center mb-4">
            All {completedLevel.requiredQuestions} cipher challenges in {completedLevel.name} decoded.
          </p>

          {/* Performance Stars */}
          <div className="flex items-center gap-3 mb-6">
            {stars.map((s) => (
              <div
                key={s}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                  s <= earned
                    ? "bg-[#00E5FF]/15 border border-[#00E5FF]/40 text-[#00E5FF] shadow-[0_0_14px_rgba(0,229,255,0.3)]"
                    : "bg-white/[0.04] border border-white/[0.08] text-white/20"
                }`}
              >
                <Star
                  size={20}
                  className={s <= earned ? "fill-[#00E5FF]" : "fill-transparent"}
                />
              </div>
            ))}
          </div>

          {/* Quick Metrics */}
          <div className="w-full grid grid-cols-3 gap-2.5 mb-6">
            <div className="p-3 rounded-xl bg-[#110B18] border border-white/[0.07] flex flex-col items-center">
              <HelpCircle size={16} className="text-[#00E5FF] mb-1" />
              <span
                className="text-base font-bold text-[#F5F3F7]"
                style={{ fontFamily: "var(--font-space-grotesk)" }}
              >
                {completedLevel.solvedQuestions}/{completedLevel.requiredQuestions}
              </span>
              <span
                className="text-[10px] text-[#A8A1B0] uppercase tracking-wider text-center"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                Solved
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#110B18] border border-white/[0.07] flex flex-col items-center">
              <Lightbulb size={16} className="text-[#dab9ff] mb-1" />
              <span
                className="text-base font-bold text-[#F5F3F7]"
                style={{ fontFamily: "var(--font-space-grotesk)" }}
              >
                {hintsUsed}
              </span>
              <span
                className="text-[10px] text-[#A8A1B0] uppercase tracking-wider text-center"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                Hints Used
              </span>
            </div>

            <div className="p-3 rounded-xl bg-[#110B18] border border-white/[0.07] flex flex-col items-center">
              <Award size={16} className="text-[#10B981] mb-1" />
              <span
                className="text-base font-bold text-[#F5F3F7]"
                style={{ fontFamily: "var(--font-space-grotesk)" }}
              >
                {earned}/3
              </span>
              <span
                className="text-[10px] text-[#A8A1B0] uppercase tracking-wider text-center"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                Rating
              </span>
            </div>
          </div>

          {/* Next Sector Card (or Treasure Unlocked) */}
          {allComplete ? (
            <div className="w-full p-4 rounded-2xl bg-[#18111F] border border-[#10B981]/30 shadow-[0_0_24px_rgba(16,185,129,0.1)] mb-6 text-left">
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-[10px] font-semibold text-[#10B981] uppercase tracking-wider"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  ALL LEVELS COMPLETE
                </span>
              </div>
              <p className="text-[13px] text-[#A8A1B0] leading-relaxed">
                All 45 questions decoded. You are now eligible for the physical treasure mission.
              </p>
            </div>
          ) : nextLevel ? (
            <div className="w-full p-4 rounded-2xl bg-[#18111F] border border-[#00E5FF]/30 shadow-[0_0_24px_rgba(0,229,255,0.06)] mb-6 text-left">
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-[10px] font-semibold text-[#00E5FF] uppercase tracking-wider"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  NEXT SECTOR UNLOCKED
                </span>
                <span
                  className="text-[11px] font-medium text-[#A8A1B0]"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {nextLevel.requiredQuestions} Clues
                </span>
              </div>

              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-9 h-9 rounded-lg bg-[#00E5FF]/15 border border-[#00E5FF]/30 flex items-center justify-center font-bold text-sm text-[#00E5FF]"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  0{nextLevel.levelNumber}
                </div>
                <div>
                  <h3
                    className="font-semibold text-base text-[#F5F3F7]"
                    style={{ fontFamily: "var(--font-space-grotesk)" }}
                  >
                    {nextLevel.name}
                  </h3>
                  <p
                    className="text-[11px] text-[#A8A1B0] uppercase tracking-wider"
                    style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                  >
                    {nextLevel.codename}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          {allComplete ? (
            <Link
              href="/treasure-mission"
              className="group w-full h-12 rounded-xl bg-[#10B981] text-[#050505] font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:bg-[#34d399] transition-all"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              <span>Proceed to Treasure Mission</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          ) : (
            <Link
              href="/mission"
              className="group w-full h-12 rounded-xl bg-[#00E5FF] text-[#050505] font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,229,255,0.3)] hover:bg-[#38ecff] transition-all"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              <span>Proceed to Next Level</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          )}

          <Link
            href="/dashboard"
            className="w-full h-11 rounded-xl bg-white/[0.04] border border-white/10 text-[#A8A1B0] hover:text-[#F5F3F7] hover:bg-white/[0.08] text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            <Radar size={16} />
            <span>Return to Expedition Radar</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
