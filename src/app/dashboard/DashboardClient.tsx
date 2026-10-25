"use client";

import Link from "next/link";
import { User, CheckCircle2, Lock, HelpCircle, Lightbulb, ArrowRight } from "lucide-react";
import { TopBar } from "@/components/navigation/TopBar";
import { BottomNav } from "@/components/navigation/BottomNav";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { TeamProgressResponse } from "@/app/actions/progressActions";

function ProgressRing({ pct }: { pct: number }) {
  const r = 24;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <svg width="60" height="60" viewBox="0 0 60 60" className="shrink-0 -rotate-90">
      <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
      <circle
        cx="30"
        cy="30"
        r={r}
        fill="none"
        stroke="#00E5FF"
        strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-700"
      />
    </svg>
  );
}

export default function DashboardClient({ progress }: { progress: TeamProgressResponse }) {
  const levels = progress.levels ?? [];
  const totalSolved = progress.totalSolved ?? 0;
  const totalTarget = progress.totalTarget;
  const overallPct = totalTarget > 0 ? Math.round((totalSolved / totalTarget) * 100) : 0;
  const callsign = progress.callsign ?? "UNKNOWN";
  const activeLevel = progress.activeLevel ?? 1;

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#050505] text-[#F5F3F7] flex flex-col justify-between">
      <TopBar
        showTeamBadge
        teamCallsign={callsign}
        rightSlot={
          <button
            aria-label="Account details"
            className="w-9 h-9 min-h-[44px] min-w-[44px] rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-[#A8A1B0] hover:text-[#00E5FF] transition-colors"
          >
            <User size={18} />
          </button>
        }
      />

      <main className="flex-1 pt-16 pb-24 px-4 max-w-lg mx-auto w-full">
        {/* Overall Progress Banner */}
        <div className="py-5">
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-[11px] font-semibold uppercase tracking-widest text-[#00E5FF]"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              MISSION PROGRESS
            </span>
            <span
              className="text-[12px] font-semibold text-[#A8A1B0]"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              LVL {activeLevel} IN PURSUIT
            </span>
          </div>

          <h1
            className="text-2xl font-bold tracking-tight text-[#F5F3F7] mb-4"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            Expedition Radar
          </h1>

          {/* Progress Card */}
          <div className="p-4 rounded-2xl bg-[#110B18] border border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.3)] flex items-center gap-4">
            <div className="relative shrink-0">
              <ProgressRing pct={overallPct} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className="text-xs font-bold text-[#00E5FF]"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {overallPct}%
                </span>
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] text-[#A8A1B0] font-medium">Solved Challenges</span>
                <span
                  className="text-[12px] font-semibold text-[#00E5FF]"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {totalSolved} / {totalTarget}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#00E5FF] transition-all duration-700 shadow-[0_0_10px_rgba(0,229,255,0.5)]"
                  style={{ width: `${overallPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Levels List */}
        <div className="flex flex-col gap-3.5">
          <p
            className="text-[11px] font-semibold uppercase tracking-widest text-[#A8A1B0] px-1"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            Sector Levels
          </p>

          {levels.map((level) => {
            const isCompleted = level.status === "completed";
            const isActive = level.status === "active";
            const isLocked = level.status === "locked";
            const lvlPct = level.requiredQuestions > 0
              ? Math.round((level.solvedQuestions / level.requiredQuestions) * 100)
              : 0;
            const hintsRemaining = Math.max(0, level.hintsAllocated - level.hintsUsed);

            return (
              <div
                key={level.levelNumber}
                className={`relative rounded-2xl p-4 transition-all duration-200 border ${
                  isActive
                    ? "bg-[#18111F] border-[#00E5FF]/40 shadow-[0_0_24px_rgba(0,229,255,0.08)]"
                    : isCompleted
                    ? "bg-[#0d1514] border-[#10B981]/25"
                    : "bg-[#0D0912]/70 border-white/[0.05] opacity-75"
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                        isActive
                          ? "bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/30"
                          : isCompleted
                          ? "bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30"
                          : "bg-white/[0.05] text-[#A8A1B0] border border-white/[0.08]"
                      }`}
                      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                    >
                      {isCompleted ? (
                        <CheckCircle2 size={18} className="text-[#10B981]" />
                      ) : isLocked ? (
                        <Lock size={16} />
                      ) : (
                        `0${level.levelNumber}`
                      )}
                    </div>

                    <div className="min-w-0">
                      <h2
                        className={`font-semibold text-[15px] leading-tight truncate ${
                          isLocked ? "text-[#A8A1B0]" : "text-[#F5F3F7]"
                        }`}
                        style={{ fontFamily: "var(--font-space-grotesk)" }}
                      >
                        {level.name}
                      </h2>
                      <p
                        className="text-[11px] text-[#A8A1B0] uppercase tracking-wider truncate"
                        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                      >
                        {level.codename}
                      </p>
                    </div>
                  </div>

                  <StatusBadge
                    status={isCompleted ? "completed" : isActive ? "active" : "locked"}
                    showDot={isActive}
                  />
                </div>

                {/* Metadata Row */}
                <div className="flex items-center gap-4 text-[12px] text-[#A8A1B0] mb-3">
                  <div className="flex items-center gap-1.5">
                    <HelpCircle size={14} className="text-[#00E5FF]" />
                    <span style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                      {level.solvedQuestions}/{level.requiredQuestions} Solved
                    </span>
                  </div>
                  <div className="w-1 h-1 rounded-full bg-white/20" />
                  <div className="flex items-center gap-1.5">
                    <Lightbulb size={14} className="text-[#dab9ff]" />
                    <span style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                      {hintsRemaining} Hints
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                {!isLocked && (
                  <div className="mb-3.5">
                    <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isCompleted ? "bg-[#10B981]" : "bg-[#00E5FF]"
                        }`}
                        style={{ width: `${lvlPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Action button */}
                {isActive && (
                  <Link
                    href="/mission"
                    id={`enter-level-${level.levelNumber}`}
                    className="group w-full h-11 rounded-xl bg-[#00E5FF] text-[#050505] font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_16px_rgba(0,229,255,0.25)] hover:bg-[#38ecff] transition-all"
                    style={{ fontFamily: "var(--font-space-grotesk)" }}
                  >
                    <span>Enter Level Challenge</span>
                    <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                )}

                {isCompleted && progress.completedAllLevels && level.levelNumber === 5 && (
                  <Link
                    href="/treasure-mission"
                    className="group w-full h-11 rounded-xl bg-[#10B981] text-[#050505] font-semibold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-[0_0_16px_rgba(16,185,129,0.25)] hover:bg-[#34d399] transition-all"
                    style={{ fontFamily: "var(--font-space-grotesk)" }}
                  >
                    <span>Proceed to Treasure Mission</span>
                    <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                )}

                {isLocked && (
                  <div className="w-full h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center gap-2 text-[#A8A1B0]/60 text-[11px] uppercase tracking-wider">
                    <Lock size={13} />
                    <span style={{ fontFamily: "var(--font-jetbrains-mono)" }}>
                      Complete Level {level.levelNumber - 1} to unlock
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
