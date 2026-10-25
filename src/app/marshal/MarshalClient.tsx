"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Key, Users, AlertCircle, LogOut, Trophy } from "lucide-react";
import { TextInput } from "@/components/common/TextInput";
import { Button } from "@/components/common/Button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { verifyTreasureAction } from "@/app/actions/gameActions";
import { marshalLogoutAction } from "@/app/actions/authActions";

type VerifyState = "idle" | "loading" | "success" | "error";

export default function MarshalClient() {
  const router = useRouter();
  const [callsign, setCallsign] = useState("");
  const [rawToken, setRawToken] = useState("");
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [resultMsg, setResultMsg] = useState("");

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!callsign.trim() || !rawToken.trim()) {
      setResultMsg("Both team callsign and physical token code are required.");
      setVerifyState("error");
      return;
    }

    setVerifyState("loading");
    setResultMsg("");

    const res = await verifyTreasureAction({
      teamCallsign: callsign.trim(),
      rawToken: rawToken.trim(),
    });

    if (!res.success) {
      setVerifyState("error");
      const errMap: Record<string, string> = {
        ERR_UNAUTHORIZED_MARSHAL: "Marshal session expired. Please re-login.",
        ERR_TEAM_NOT_FOUND: "Team callsign not recognized or disqualified.",
        ERR_TEAM_INCOMPLETE_QUESTIONS: "Team has not completed all 45 required questions.",
        ERR_INVALID_PHYSICAL_TOKEN: "Physical cache token does not match authoritative verifier.",
        ERR_EVENT_ALREADY_WON: "Event already won! A verified winner has already been recorded.",
        ERR_EVENT_EXPIRED: "Event window has closed.",
      };
      setResultMsg(errMap[res.error || ""] || "Verification rejected by security gate.");
      if (res.error === "ERR_UNAUTHORIZED_MARSHAL") {
        setTimeout(() => router.push("/marshal/login"), 1500);
      }
      return;
    }

    setVerifyState("success");
    setResultMsg(`Winner verified! Team ${callsign.toUpperCase()} is officially crowned champion.`);
  };

  const handleLogout = async () => {
    await marshalLogoutAction();
    router.push("/marshal/login");
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#050505] text-[#F5F3F7] flex flex-col justify-between">
      <header className="fixed top-0 inset-x-0 z-50 bg-[#110B18]/95 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-md mx-auto h-14 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-[#00E5FF]" />
            <span
              className="text-xs font-semibold tracking-wider text-[#F5F3F7] uppercase"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              Marshal Station
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#A8A1B0] hover:text-[#f87171] hover:bg-white/[0.04] transition-colors"
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <main className="flex-1 pt-20 pb-12 px-4 max-w-md mx-auto w-full flex flex-col justify-between">
        <div>
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <StatusBadge status="verified" showDot>
                SINGLE WINNER VERIFICATION
              </StatusBadge>
            </div>
            <h1
              className="text-2xl font-bold tracking-tight text-[#F5F3F7] mb-2"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              Verify Physical Cache
            </h1>
            <p className="text-[13px] text-[#A8A1B0] leading-relaxed">
              When a squad that completed all 45 clues brings the physical token to your checkpoint, enter their callsign and token string below.
            </p>
          </div>

          <form onSubmit={handleVerify} className="flex flex-col gap-4">
            <TextInput
              label="Squad Callsign"
              value={callsign}
              onChange={(e) => setCallsign(e.target.value)}
              placeholder="e.g. ARCHIMEDES"
              leadingIcon={<Users size={18} />}
              autoComplete="off"
              required
            />

            <TextInput
              label="Physical Token (Found in Cache)"
              value={rawToken}
              onChange={(e) => setRawToken(e.target.value)}
              placeholder="e.g. HUNT-9X2K-4M7P-W8Q1-Z3J5-F6R8"
              leadingIcon={<Key size={18} />}
              autoComplete="off"
              required
            />

            {verifyState === "error" && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-[#f87171] text-xs">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{resultMsg}</span>
              </div>
            )}

            {verifyState === "success" && (
              <div className="flex items-start gap-2.5 p-4 rounded-xl bg-[#10B981]/15 border border-[#10B981]/30 text-[#10B981] text-xs leading-relaxed">
                <Trophy size={20} className="shrink-0 text-[#00E5FF]" />
                <div>
                  <p className="font-bold text-sm text-[#00E5FF] mb-1">CHAMPION CONFIRMED</p>
                  <p>{resultMsg}</p>
                </div>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={verifyState === "loading"}
              disabled={verifyState === "success"}
              className="w-full mt-2"
            >
              Verify Winner & Crown Champion
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
