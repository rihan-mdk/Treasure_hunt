import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuthenticatedTeam } from "@/lib/server/authGuard";
import { getCurrentQuestionAction } from "@/app/actions/progressActions";
import MissionClient from "./MissionClient";

export const metadata: Metadata = {
  title: "Active Mission — Cipher Challenge | The Hunt",
  description: "Decode the intercepted transmission and submit your answer.",
};

export const instant = false;

export default async function MissionPage() {
  // Server-side auth guard
  const teamCtx = await getAuthenticatedTeam();
  if (!teamCtx) {
    redirect("/login");
  }

  const questionData = await getCurrentQuestionAction();

  // All levels completed — redirect to treasure mission
  if (questionData.success && questionData.allLevelsCompleted) {
    redirect("/treasure-mission");
  }

  // Level just completed — redirect to level-complete interstitial
  if (questionData.success && questionData.levelCompleted) {
    redirect("/dashboard");
  }

  if (!questionData.success || !questionData.question) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#050505] text-[#F5F3F7] flex flex-col items-center justify-center px-4">
        <div className="max-w-sm w-full text-center">
          <h1
            className="text-2xl font-bold mb-3 text-[#F5F3F7]"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            Mission Unavailable
          </h1>
          <p className="text-sm text-[#A8A1B0] mb-6">
            {questionData.error === "ERR_UNAUTHORIZED" || questionData.error === "ERR_SESSION_EXPIRED"
              ? "Your session has expired. Please sign in again."
              : "Could not load the current mission. Please return to the dashboard."}
          </p>
          <a
            href={questionData.error === "ERR_UNAUTHORIZED" || questionData.error === "ERR_SESSION_EXPIRED" ? "/login" : "/dashboard"}
            className="inline-block h-11 px-6 rounded-xl bg-[#00E5FF] text-[#050505] font-semibold text-xs uppercase tracking-wider leading-[44px] shadow-[0_0_16px_rgba(0,229,255,0.25)]"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            {questionData.error === "ERR_UNAUTHORIZED" || questionData.error === "ERR_SESSION_EXPIRED" ? "Sign In" : "Back to Dashboard"}
          </a>
        </div>
      </div>
    );
  }

  return (
    <MissionClient
      question={questionData.question}
      hintsRemainingInLevel={questionData.hintsRemainingInLevel ?? 0}
    />
  );
}
