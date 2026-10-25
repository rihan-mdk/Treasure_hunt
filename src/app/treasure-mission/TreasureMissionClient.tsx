"use client";

import { useState } from "react";
import {
  HelpCircle,
  Layers,
  Lightbulb,
  Info,
  Crosshair,
  CheckCircle2,
  Key,
  Shield,
  ArrowRight,
  Trophy,
} from "lucide-react";
import { TopBar } from "@/components/navigation/TopBar";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/common/Button";

type VerifyState = "idle" | "loading" | "submitted" | "error";

interface TreasureMissionClientProps {
  teamCallsign: string;
  totalSolved: number;
  totalTarget: number;
}

export default function TreasureMissionClient({
  teamCallsign,
  totalSolved,
  totalTarget,
}: TreasureMissionClientProps) {
  const [cacheCode, setCacheCode] = useState("");
  const [marshalStation, setMarshalStation] = useState("");
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [statusMsg, setStatusMsg] = useState("");

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cacheCode.trim() || !marshalStation.trim()) return;

    setVerifyState("loading");
    setStatusMsg("");

    // This form is informational for the team. Actual winner verification
    // is performed by the marshal through /marshal. The team submits their
    // cache code and marshal station here to signal readiness.
    await new Promise((r) => setTimeout(r, 800));
    setVerifyState("submitted");
    setStatusMsg(
      `Cache code ${cacheCode.toUpperCase()} recorded. Present your code and callsign (${teamCallsign}) to the marshal at ${marshalStation} for final verification.`
    );
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#050505] text-[#F5F3F7] flex flex-col justify-between">
      <TopBar showBack backHref="/dashboard" title="Final Mission" />

      <main className="flex-1 pt-18 pb-12 px-4 max-w-md mx-auto w-full">
        {/* Header */}
        <div className="py-4">
          <div className="flex items-center gap-2 mb-3">
            <StatusBadge status="completed" showDot>
              ALL {totalTarget} QUESTIONS CLEARED
            </StatusBadge>
          </div>

          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight text-[#F5F3F7] mb-2"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            Physical Cache Unlocked
          </h1>
          <p className="text-[14px] text-[#A8A1B0] leading-relaxed">
            Every digital cipher has been cracked. Navigate to the physical coordinates to discover the cache and enter the verification token below.
          </p>
        </div>

        {/* Mission Stats */}
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <div className="p-3 rounded-xl bg-[#110B18] border border-white/[0.07] flex flex-col items-center">
            <HelpCircle size={16} className="text-[#00E5FF] mb-1" />
            <span
              className="text-base font-bold text-[#F5F3F7]"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              {totalSolved}/{totalTarget}
            </span>
            <span
              className="text-[10px] text-[#A8A1B0] uppercase tracking-wider text-center"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              Questions
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#110B18] border border-white/[0.07] flex flex-col items-center">
            <Layers size={16} className="text-[#dab9ff] mb-1" />
            <span
              className="text-base font-bold text-[#F5F3F7]"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              5/5
            </span>
            <span
              className="text-[10px] text-[#A8A1B0] uppercase tracking-wider text-center"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              Levels
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#110B18] border border-white/[0.07] flex flex-col items-center">
            <Lightbulb size={16} className="text-[#10B981] mb-1" />
            <span
              className="text-base font-bold text-[#F5F3F7]"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              ✓
            </span>
            <span
              className="text-[10px] text-[#A8A1B0] uppercase tracking-wider text-center"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              Eligible
            </span>
          </div>
        </div>

        {/* Critical Rule Alert */}
        <div className="p-3.5 rounded-xl bg-[#3B0A6B]/20 border border-[#3B0A6B]/50 flex items-start gap-3 mb-5">
          <Info size={18} className="text-[#00E5FF] shrink-0 mt-0.5" />
          <div>
            <p
              className="text-[11px] text-[#00E5FF] uppercase tracking-wider font-semibold mb-0.5"
              style={{ fontFamily: "var(--font-jetbrains-mono)" }}
            >
              Marshal Protocol
            </p>
            <p className="text-[12px] text-[#A8A1B0] leading-relaxed">
              Completing all questions does not automatically make you the winner. You must physically reach the location and confirm your arrival with the field marshal.
            </p>
          </div>
        </div>

        {/* Verification Form Card */}
        <div className="p-5 rounded-2xl bg-[#110B18] border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.4)] mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2
              className="font-semibold text-base text-[#F5F3F7]"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              On-Site Verification
            </h2>
            <Crosshair size={18} className="text-[#00E5FF]" />
          </div>

          {verifyState === "submitted" ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#10B981]/20 border border-[#10B981]/40 flex items-center justify-center text-[#10B981]">
                <CheckCircle2 size={26} />
              </div>
              <h3
                className="font-semibold text-base text-[#F5F3F7]"
                style={{ fontFamily: "var(--font-space-grotesk)" }}
              >
                Ready for Marshal Verification
              </h3>
              <p className="text-[13px] text-[#A8A1B0] leading-relaxed max-w-xs">
                {statusMsg}
              </p>
              <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                <Trophy size={16} className="text-[#00E5FF]" />
                <span className="text-xs text-[#A8A1B0]">
                  The marshal will use the Marshal Portal to confirm your win.
                </span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleVerify} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="cache-code"
                  className="text-[11px] font-semibold uppercase tracking-wider text-[#A8A1B0]"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  Physical Cache Token
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-[#A8A1B0] pointer-events-none">
                    <Key size={18} />
                  </span>
                  <input
                    id="cache-code"
                    type="text"
                    value={cacheCode}
                    onChange={(e) => setCacheCode(e.target.value.toUpperCase())}
                    placeholder="e.g. HUNT-9X2K-4M7P-W8Q1"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={verifyState === "loading"}
                    className="w-full h-12 bg-[#0D0912] border border-white/10 pl-10 pr-4 rounded-xl text-base tracking-widest uppercase text-[#F5F3F7] placeholder:text-[#A8A1B0]/40 outline-none focus:border-[#00E5FF]/60"
                    style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="marshal-station"
                  className="text-[11px] font-semibold uppercase tracking-wider text-[#A8A1B0]"
                  style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                >
                  Marshal Station Identifier
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-[#A8A1B0] pointer-events-none">
                    <Shield size={18} />
                  </span>
                  <input
                    id="marshal-station"
                    type="text"
                    value={marshalStation}
                    onChange={(e) => setMarshalStation(e.target.value)}
                    placeholder="Station ID (e.g. ALPHA-GATE)"
                    autoComplete="off"
                    disabled={verifyState === "loading"}
                    className="w-full h-12 bg-[#0D0912] border border-white/10 pl-10 pr-4 rounded-xl text-sm text-[#F5F3F7] placeholder:text-[#A8A1B0]/40 outline-none focus:border-[#00E5FF]/60"
                  />
                </div>
              </div>

              {verifyState === "error" && statusMsg && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-[#f87171] text-xs">
                  <span>{statusMsg}</span>
                </div>
              )}

              <Button
                type="submit"
                id="verify-discovery-btn"
                variant="primary"
                isLoading={verifyState === "loading"}
                className="w-full mt-1"
                rightIcon={<ArrowRight size={18} />}
              >
                Submit Discovery for Verification
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
