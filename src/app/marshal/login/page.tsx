"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, User, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import { TextInput } from "@/components/common/TextInput";
import { Button } from "@/components/common/Button";
import { TopBar } from "@/components/navigation/TopBar";
import { StatusBadge } from "@/components/common/StatusBadge";
import { marshalLoginAction } from "@/app/actions/authActions";

type AuthState = "idle" | "loading" | "success" | "error";

export default function MarshalLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setErrorMsg("Marshal credentials required.");
      return;
    }

    setAuthState("loading");
    setErrorMsg("");

    const res = await marshalLoginAction({ username, password });

    if (!res.success) {
      setAuthState("error");
      setErrorMsg(
        res.error === "ERR_AUTH_RATE_LIMITED"
          ? "Too many failed attempts. Account temporarily locked."
          : "Invalid marshal credentials."
      );
      return;
    }

    setAuthState("success");
    setTimeout(() => router.push("/marshal"), 600);
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#050505] text-[#F5F3F7] flex flex-col justify-between">
      <TopBar showBack backHref="/" title="Marshal Portal" />

      <main className="flex-1 flex flex-col justify-center px-5 pt-20 pb-12 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-[#00E5FF]/10 blur-3xl" />
        </div>

        <div className="max-w-sm mx-auto w-full">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <StatusBadge status="verified" showDot>
                MARSHAL VERIFICATION DESK
              </StatusBadge>
            </div>
            <h1
              className="text-3xl font-bold tracking-tight text-[#F5F3F7] mb-2"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              Field Marshal Access
            </h1>
            <p className="text-[13px] text-[#A8A1B0] leading-relaxed">
              Authorized marshals only. Authenticate to access physical treasure verification.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <TextInput
              label="Marshal Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. MARSHAL_ALPHA"
              leadingIcon={<User size={18} />}
              autoComplete="username"
              required
            />

            <TextInput
              label="Access Code"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter master key..."
              leadingIcon={<Lock size={18} />}
              autoComplete="current-password"
              required
            />

            {errorMsg && (
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-[#f87171] text-xs">
                <AlertCircle size={15} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {authState === "success" && (
              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#10B981]/15 border border-[#10B981]/30 text-[#10B981] text-xs">
                <CheckCircle2 size={15} className="shrink-0" />
                <span>Station authorized. Loading verification station...</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={authState === "loading"}
              disabled={authState === "success"}
              rightIcon={<ArrowRight size={18} />}
              className="w-full mt-2"
            >
              Authorize Station
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
