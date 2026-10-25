"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Key, Eye, EyeOff, ShieldCheck, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { TextInput } from "@/components/common/TextInput";
import { Button } from "@/components/common/Button";
import { TopBar } from "@/components/navigation/TopBar";
import { StatusBadge } from "@/components/common/StatusBadge";

import { teamLoginAction } from "@/app/actions/authActions";

type AuthState = "idle" | "loading" | "success" | "error";

export default function LoginPage() {
  const router = useRouter();
  const [teamId, setTeamId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId.trim() || !password.trim()) {
      setErrorMsg("Both team name and event password are required.");
      return;
    }

    setAuthState("loading");
    setErrorMsg("");

    const res = await teamLoginAction({
      teamIdentifier: teamId.trim(),
      password,
    });

    if (!res.success) {
      setAuthState("error");
      setErrorMsg(
        res.error === "ERR_AUTH_RATE_LIMITED"
          ? "Too many failed attempts. Account temporarily locked for 15 minutes."
          : "Invalid squad credentials. Check your callsign and event password."
      );
      return;
    }

    setAuthState("success");
    setTimeout(() => router.push("/dashboard"), 600);
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#050505] text-[#F5F3F7] flex flex-col justify-between">
      <TopBar showBack backHref="/" title="Team Access" />

      <main className="flex-1 flex flex-col justify-center px-5 pt-20 pb-12 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-[#3B0A6B]/20 blur-3xl" />
        </div>

        <div className="max-w-sm mx-auto w-full">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <StatusBadge status="active" showDot>
                SQUAD AUTHENTICATION
              </StatusBadge>
            </div>
            <h1
              className="text-3xl font-bold tracking-tight text-[#F5F3F7] mb-2"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              Sign into your team
            </h1>
            <p className="text-[14px] text-[#A8A1B0] leading-relaxed">
              Enter your squad callsign and access pass to unlock current mission coordinates.
            </p>
          </div>

          {/* Form Card */}
          <div className="bg-[#110B18] rounded-2xl p-6 border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            <form id="expedition-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
              <TextInput
                id="team-id"
                label="Team Callsign / ID"
                leadingIcon={<Users size={18} />}
                placeholder="e.g. Shadow Vanguard"
                autoComplete="off"
                spellCheck={false}
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                disabled={authState === "loading" || authState === "success"}
              />

              <TextInput
                id="event-password"
                label="Mission Password"
                leadingIcon={<Key size={18} />}
                type={showPassword ? "text" : "password"}
                placeholder="Enter event password"
                autoComplete="current-password"
                cipherFont
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={authState === "loading" || authState === "success"}
                trailingAction={
                  <button
                    type="button"
                    id="toggle-pwd-btn"
                    aria-label="Toggle password visibility"
                    onClick={() => setShowPassword((v) => !v)}
                    className="w-9 h-9 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#A8A1B0] hover:text-[#00E5FF] transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />

              {/* Security notice */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <ShieldCheck size={16} className="text-[#00E5FF] shrink-0" />
                <p className="text-[12px] text-[#A8A1B0]">
                  One active session per squad. Progress syncs live.
                </p>
              </div>

              {/* Error Alert */}
              {errorMsg && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/30">
                  <AlertCircle size={16} className="text-[#f87171] shrink-0" />
                  <p className="text-[12px] text-[#f87171] font-medium">{errorMsg}</p>
                </div>
              )}

              {/* Success Notice */}
              {authState === "success" && (
                <div className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#10B981]/15 border border-[#10B981]/30">
                  <CheckCircle2 size={18} className="text-[#10B981]" />
                  <span
                    className="text-[12px] text-[#10B981] font-semibold tracking-wider uppercase"
                    style={{ fontFamily: "var(--font-jetbrains-mono)" }}
                  >
                    Grid Access Granted
                  </span>
                </div>
              )}

              <Button
                type="submit"
                id="submit-btn"
                variant="primary"
                isLoading={authState === "loading"}
                disabled={authState === "success"}
                rightIcon={<ArrowRight size={18} />}
                className="mt-2 w-full"
              >
                Access Mission Radar
              </Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
