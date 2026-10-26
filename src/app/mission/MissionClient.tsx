"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, XCircle, MapPin, CheckCircle2, ArrowRight, Lightbulb, AlertCircle } from "lucide-react";
import { Button } from "@/components/common/Button";
import { StatusBadge } from "@/components/common/StatusBadge";
import HintBottomSheet from "@/components/mission/HintBottomSheet";
import { submitAnswerAction } from "@/app/actions/gameActions";
import type { CurrentQuestionResponse } from "@/app/actions/progressActions";

type Question = NonNullable<CurrentQuestionResponse["question"]>;

interface MissionClientProps {
  question: Question;
  hintsRemainingInLevel: number;
}

export default function MissionClient({ question, hintsRemainingInLevel }: MissionClientProps) {
  const router = useRouter();
  const q = question;
  const [answer, setAnswer] = useState("");
  const [submitState, setSubmitState] = useState<
    "idle" | "loading" | "correct" | "wrong" | "inactive"
  >("idle");
  const [showHints, setShowHints] = useState(false);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) return;
    setSubmitState("loading");

    const res = await submitAnswerAction({
      questionId: q.id,
      answer: answer.trim(),
    });

    if (res.success && res.correct) {
      setSubmitState("correct");
      // Navigate to next question or level complete after a brief delay
      setTimeout(() => {
        if (res.treasureMissionUnlocked) {
          router.push("/treasure-mission");
        } else if (res.levelCompleted) {
          router.push("/level-complete");
        } else {
          // Reload to get next question
          router.refresh();
          setAnswer("");
          setSubmitState("idle");
        }
      }, 1200);
    } else if (res.error === "ERR_EVENT_NOT_ACTIVE") {
      // Event is in draft / has ended — this is NOT a wrong answer
      setSubmitState("inactive");
      setTimeout(() => setSubmitState("idle"), 4000);
    } else if (res.success === false) {
      // Network / config / unexpected server error — neutral message
      setSubmitState("inactive");
      setTimeout(() => setSubmitState("idle"), 4000);
    } else {
      // success === true, correct === false → genuine wrong answer
      setSubmitState("wrong");
      setTimeout(() => setSubmitState("idle"), 2400);
    }
  };

  const progressPct = q.totalInLevel > 0
    ? Math.round(((q.orderSeq - 1) / q.totalInLevel) * 100)
    : 0;

  // Map hints for the HintBottomSheet component
  const hintProps = q.hints.map((h) => ({
    id: h.hintNumber,
    hintId: h.id,
    title: h.title,
    description: h.content ?? "",
    isRevealed: h.isRevealed,
  }));

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#050505] text-[#F5F3F7] flex flex-col justify-between">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 bg-[#110B18]/95 backdrop-blur-xl border-b border-white/[0.06]">
        <div
          className="h-14 px-4 flex items-center justify-between gap-3"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <Link
            href="/dashboard"
            aria-label="Exit to dashboard"
            className="flex items-center justify-center w-10 h-10 min-h-[44px] min-w-[44px] rounded-xl text-[#A8A1B0] hover:text-[#F5F3F7] hover:bg-white/[0.06] transition-colors -ml-1"
          >
            <ArrowLeft size={20} />
          </Link>

          <div className="flex-1 min-w-0 max-w-xs mx-auto">
            <div className="flex items-center justify-between mb-1.5">
              <span
                className="text-[10px] font-semibold tracking-wider text-[#00E5FF] uppercase"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                LEVEL {q.levelNumber}
              </span>
              <span
                className="text-[10px] font-medium text-[#A8A1B0]"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                CHALLENGE {q.orderSeq}/{q.totalInLevel}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#00E5FF] transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <button
            onClick={() => setShowAbortConfirm(true)}
            aria-label="Abort challenge"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[#A8A1B0] hover:text-[#f87171] hover:bg-red-500/10 transition-colors text-[11px] font-semibold tracking-wider uppercase min-h-[44px]"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            <XCircle size={15} />
            <span>EXIT</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pt-18 pb-10 px-4 max-w-md mx-auto w-full flex flex-col justify-between">
        <div className="pt-2">
          {/* Eyebrow & Title */}
          <div className="flex items-center gap-2 mb-2">
            <StatusBadge status="active" showDot>
              {q.cipherType}
            </StatusBadge>
          </div>

          <h1
            className="text-xl font-bold tracking-tight text-[#F5F3F7] mb-2"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            {q.title}
          </h1>

          {/* Story Prompt */}
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-4">
            <p className="text-[13px] text-[#A8A1B0] leading-relaxed">
              {q.prompt}
            </p>
          </div>

          {/* Cipher Payload Card */}
          <div className="p-4 rounded-2xl bg-[#110B18] border border-[#3B0A6B]/50 shadow-[0_4px_24px_rgba(59,10,107,0.2)] mb-5">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-2 h-2 rounded-full bg-[#00E5FF] animate-pulse" />
              <span
                className="text-[10px] uppercase tracking-wider text-[#00E5FF] font-semibold"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                INTERCEPTED TRANSMISSION
              </span>
            </div>

            {q.cipherPayload && (
              <p
                className="text-[15px] font-medium leading-relaxed tracking-wider text-[#F5F3F7] break-words mb-3"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                {q.cipherPayload}
              </p>
            )}

            {q.coordinatesHint && (
              <div className="pt-2.5 border-t border-white/[0.06] flex items-center gap-1.5 text-[#A8A1B0]">
                <MapPin size={13} className="text-[#dab9ff]" />
                <span
                  className="text-[11px] tracking-wider uppercase font-medium"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  {q.coordinatesHint}
                </span>
              </div>
            )}
          </div>

          {/* Answer Input & Submit */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label
              htmlFor="answer-input"
              className="text-[11px] text-[#A8A1B0] uppercase tracking-wider font-semibold"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              Your Decoded Answer
            </label>

            <input
              id="answer-input"
              type="text"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Enter decrypted solution..."
              autoComplete="off"
              spellCheck={false}
              disabled={submitState === "loading" || submitState === "correct"}
              className={`w-full h-12 bg-[#0D0912] border rounded-xl px-4 text-[14px] text-[#F5F3F7] placeholder:text-[#A8A1B0]/50 outline-none transition-all duration-200 tracking-wide ${
                submitState === "correct"
                  ? "border-[#10B981] shadow-[0_0_16px_rgba(16,185,129,0.25)]"
                  : submitState === "wrong"
                  ? "border-[#EF4444] shadow-[0_0_12px_rgba(239,68,68,0.2)]"
                  : submitState === "inactive"
                  ? "border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                  : "border-white/10 focus:border-[#00E5FF]/60 focus:bg-[#0e0915]"
              }`}
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            />

            {/* Validation Feedback */}
            {submitState === "correct" && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-[#10B981]/15 border border-[#10B981]/30">
                <CheckCircle2 size={16} className="text-[#10B981]" />
                <span
                  className="text-[12px] text-[#10B981] font-semibold tracking-wider uppercase"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  Correct — Waypoint Verified
                </span>
              </div>
            )}

            {submitState === "inactive" && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30">
                <AlertCircle size={16} className="text-amber-400" />
                <span
                  className="text-[12px] text-amber-300 font-semibold tracking-wider uppercase"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  Expedition not active — submissions unavailable
                </span>
              </div>
            )}

            {submitState === "wrong" && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-[#EF4444]/15 border border-[#EF4444]/30">
                <XCircle size={16} className="text-[#f87171]" />
                <span
                  className="text-[12px] text-[#f87171] font-semibold tracking-wider uppercase"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  Incorrect solution — check hints and retry
                </span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              isLoading={submitState === "loading"}
              disabled={submitState === "correct"}
              rightIcon={<ArrowRight size={18} />}
              className="w-full mt-1"
            >
              Verify Solution
            </Button>
          </form>

          {/* Hint Trigger */}
          <div className="mt-3">
            <button
              id="open-hints-btn"
              onClick={() => setShowHints(true)}
              className="w-full h-11 min-h-[44px] rounded-xl bg-[#3B0A6B]/25 border border-[#3B0A6B]/50 text-[#dab9ff] text-[12px] uppercase tracking-wider font-semibold flex items-center justify-center gap-2 hover:bg-[#3B0A6B]/40 transition-colors"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              <Lightbulb size={16} />
              <span>Use Hint · {hintsRemainingInLevel} Available</span>
            </button>
          </div>
        </div>
      </main>

      {/* Hint Bottom Sheet */}
      <HintBottomSheet
        isOpen={showHints}
        onClose={() => setShowHints(false)}
        hints={hintProps}
        hintsRemaining={hintsRemainingInLevel}
        cipherType={q.cipherType}
        cipherPayload={q.cipherPayload ?? ""}
        storyPrompt={q.prompt}
      />

      {/* Abort Dialog */}
      {showAbortConfirm && (
        <div className="fixed inset-0 z-[100] bg-[#050505]/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#140924] border border-white/10 p-5 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-[#f87171]">
                <XCircle size={20} />
              </div>
              <div>
                <h3
                  className="font-semibold text-base text-[#F5F3F7]"
                  style={{ fontFamily: "var(--font-space-grotesk)" }}
                >
                  Exit Challenge?
                </h3>
                <p className="text-[12px] text-[#A8A1B0]">
                  Your progress is saved to your team session.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-4">
              <Link
                href="/dashboard"
                className="w-full h-11 rounded-xl bg-red-500/15 border border-red-500/30 text-[#f87171] font-semibold text-xs uppercase tracking-wider flex items-center justify-center hover:bg-red-500/25 transition-colors"
                style={{ fontFamily: "var(--font-space-grotesk)" }}
              >
                Return to Radar
              </Link>
              <button
                onClick={() => setShowAbortConfirm(false)}
                className="w-full h-11 rounded-xl bg-white/[0.06] border border-white/10 text-[#F5F3F7] font-semibold text-xs uppercase tracking-wider flex items-center justify-center hover:bg-white/10 transition-colors"
                style={{ fontFamily: "var(--font-space-grotesk)" }}
              >
                Keep Solving
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
