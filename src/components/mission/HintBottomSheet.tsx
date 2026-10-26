"use client";

import { useState } from "react";
import { Lightbulb, X, CheckCircle2, Eye, Lock, ArrowRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/common/Button";

interface Hint {
  /** Display ordinal (1, 2, 3) — used for UI numbering and local state keying only. */
  id: number;
  /** The database UUID of this hint row — must be passed unchanged to revealHintAction. */
  hintId: string;
  title: string;
  description: string;
  isRevealed: boolean;
}

interface HintBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  hints: Hint[];
  hintsRemaining: number;
  cipherType: string;
  cipherPayload: string;
  storyPrompt?: string;
}

import { revealHintAction } from "@/app/actions/gameActions";

export default function HintBottomSheet({
  isOpen,
  onClose,
  hints,
  hintsRemaining,
  cipherType,
  cipherPayload,
}: HintBottomSheetProps) {
  const [localHints, setLocalHints] = useState(hints);
  const [localRemaining, setLocalRemaining] = useState(hintsRemaining);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [hintError, setHintError] = useState<string | null>(null);

  /**
   * Reveal a hint by passing its database UUID (hintId) to the server action.
   * The numeric display id is kept for UI state only and must NOT be sent to the DB.
   */
  const revealHint = async (id: number, hintId: string) => {
    if (localRemaining <= 0) return;
    setLoadingId(id);
    setHintError(null);

    try {
      const res = await revealHintAction({ hintId });
      if (res.success) {
        // Only update UI and decrement count on confirmed server success
        setLocalHints((prev) =>
          prev.map((h) =>
            h.id === id
              ? { ...h, isRevealed: true, description: res.content || h.description }
              : h
          )
        );
        if (typeof res.hintsRemaining === "number") {
          setLocalRemaining(res.hintsRemaining);
        } else {
          setLocalRemaining((v) => Math.max(0, v - 1));
        }
      } else {
        // Surface a clear error; do NOT decrement count or reveal content
        const errorCode = res.error ?? "";
        if (errorCode === "ERR_EVENT_NOT_ACTIVE") {
          setHintError("The expedition is not active yet. Hints are unavailable until the event begins.");
        } else if (errorCode === "ERR_LEVEL_HINTS_DISABLED") {
          setHintError("Hints are unavailable in Sector Omega (Level 5).");
        } else if (errorCode === "ERR_HINT_QUOTA_EXCEEDED") {
          setHintError("No hints remaining for this level.");
        } else if (errorCode === "ERR_UNAUTHORIZED") {
          setHintError("Your session has expired. Please log in again.");
        } else {
          setHintError("Unable to reveal this hint. Please try again.");
        }
      }
    } catch {
      setHintError("A network error occurred. Please check your connection and retry.");
    } finally {
      setLoadingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[90] bg-[#050505]/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-label="Field Hints"
        aria-modal="true"
        className="fixed bottom-0 inset-x-0 z-[95] max-w-md mx-auto"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="rounded-t-3xl bg-[#140924] border border-white/10 border-b-0 shadow-[0_-8px_32px_rgba(0,0,0,0.8)]">
          {/* Handle */}
          <div className="flex items-center justify-center pt-3 pb-1">
            <div className="w-10 h-1.5 rounded-full bg-white/20" />
          </div>

          {/* Header */}
          <div className="px-5 pt-2 pb-4 border-b border-white/[0.08]">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Lightbulb size={18} className="text-[#00E5FF]" />
                  <span
                    className="font-semibold text-base text-[#F5F3F7]"
                    style={{ fontFamily: "var(--font-space-grotesk)" }}
                  >
                    Field Hints
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider ${
                      localRemaining > 0
                        ? "bg-[#00E5FF]/10 text-[#00E5FF] border border-[#00E5FF]/20"
                        : "bg-white/5 text-[#A8A1B0] border border-white/10"
                    }`}
                    style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                  >
                    {localRemaining} LEFT
                  </span>
                </div>
                <p
                  className="text-[11px] text-[#A8A1B0] uppercase tracking-wider font-medium"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  Intercept · {cipherType}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close hints"
                className="w-10 h-10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#A8A1B0] hover:text-[#F5F3F7] hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Cipher recap */}
          <div className="mx-5 mt-4 p-3.5 rounded-xl bg-[#09050e] border border-[#3B0A6B]/50">
            <p
              className="text-[13px] font-medium leading-relaxed tracking-wider text-[#F5F3F7] break-words"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              {cipherPayload}
            </p>
          </div>

          {/* Hint error banner — shown when a reveal request fails */}
          {hintError && (
            <div className="mx-5 mt-3 flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <AlertCircle size={15} className="text-amber-400 mt-0.5 shrink-0" />
              <p
                className="text-[12px] text-amber-300 leading-snug"
                style={{ fontFamily: "var(--font-jetbrains-mono)" }}
              >
                {hintError}
              </p>
              <button
                onClick={() => setHintError(null)}
                aria-label="Dismiss error"
                className="ml-auto text-amber-400/60 hover:text-amber-300 transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* Hints list */}
          <div className="px-5 py-4 flex flex-col gap-3 max-h-[42vh] overflow-y-auto">
            {localHints.map((hint) => (
              <div
                key={hint.id}
                className={`rounded-xl border transition-all duration-200 ${
                  hint.isRevealed
                    ? "bg-[#3B0A6B]/20 border-[#3B0A6B]/60"
                    : "bg-[#0D0912]/80 border-white/[0.08]"
                }`}
              >
                <div className="p-3.5">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                          hint.isRevealed
                            ? "bg-[#00E5FF]/20 text-[#00E5FF]"
                            : "bg-white/10 text-[#A8A1B0]"
                        }`}
                        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                      >
                        {hint.id}
                      </div>
                      <span
                        className={`text-[12px] uppercase tracking-wider font-semibold ${
                          hint.isRevealed ? "text-[#dab9ff]" : "text-[#A8A1B0]"
                        }`}
                        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                      >
                        {hint.title}
                      </span>
                    </div>
                    {hint.isRevealed && (
                      <CheckCircle2 size={16} className="text-[#10B981]" />
                    )}
                  </div>

                  {hint.isRevealed ? (
                    <p className="text-[13px] text-[#F5F3F7] leading-relaxed ml-8">
                      {hint.description}
                    </p>
                  ) : (
                    <button
                      onClick={() => revealHint(hint.id, hint.hintId)}
                      disabled={localRemaining <= 0 || loadingId === hint.id}
                      className={`ml-8 w-[calc(100%-2rem)] h-11 min-h-[44px] rounded-lg text-[11px] uppercase tracking-wider font-semibold flex items-center justify-center gap-2 transition-all ${
                        loadingId === hint.id
                          ? "bg-[#3B0A6B]/30 border border-[#3B0A6B]/50 text-[#A8A1B0] cursor-wait"
                          : localRemaining > 0
                          ? "bg-[#3B0A6B]/40 border border-[#3B0A6B]/70 text-[#dab9ff] hover:bg-[#3B0A6B]/60 active:scale-[0.98]"
                          : "bg-white/[0.04] border border-white/[0.06] text-[#A8A1B0]/50 cursor-not-allowed"
                      }`}
                      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                    >
                      {loadingId === hint.id ? (
                        <span>REVEALING...</span>
                      ) : localRemaining > 0 ? (
                        <>
                          <Eye size={14} />
                          REVEAL HINT
                        </>
                      ) : (
                        <>
                          <Lock size={14} />
                          NO HINTS REMAINING
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Footer CTA */}
          <div className="px-5 py-4 border-t border-white/[0.08]">
            <Button
              variant="primary"
              className="w-full"
              onClick={onClose}
              rightIcon={<ArrowRight size={18} />}
            >
              Back to Mission
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
