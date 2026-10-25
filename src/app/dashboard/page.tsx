import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuthenticatedTeam } from "@/lib/server/authGuard";
import { getTeamProgressAction } from "@/app/actions/progressActions";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = {
  title: "Expedition Control — Dashboard | The Hunt",
  description: "Track your team's progress across all five expedition levels.",
};

export const instant = false;

export default async function DashboardPage() {
  // Server-side auth guard — redirect unauthenticated users
  const teamCtx = await getAuthenticatedTeam();
  if (!teamCtx) {
    redirect("/login");
  }

  // Fetch real progress from database
  const progress = await getTeamProgressAction();

  if (!progress.success) {
    // Show a graceful error state if DB is unavailable
    return (
      <div className="min-h-screen min-h-[100dvh] bg-[#050505] text-[#F5F3F7] flex flex-col items-center justify-center px-4">
        <div className="max-w-sm w-full text-center">
          <h1
            className="text-2xl font-bold mb-3 text-[#F5F3F7]"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            Unable to Load Progress
          </h1>
          <p className="text-sm text-[#A8A1B0] mb-6">
            {progress.error === "ERR_SESSION_EXPIRED"
              ? "Your session has expired. Please sign in again."
              : progress.error === "ERR_TEAM_DISQUALIFIED"
              ? "This team has been disqualified from the expedition."
              : "There was a problem loading your expedition data. Please try again."}
          </p>
          <a
            href={progress.error === "ERR_SESSION_EXPIRED" ? "/login" : "/dashboard"}
            className="inline-block h-11 px-6 rounded-xl bg-[#00E5FF] text-[#050505] font-semibold text-xs uppercase tracking-wider leading-[44px] shadow-[0_0_16px_rgba(0,229,255,0.25)]"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
          >
            {progress.error === "ERR_SESSION_EXPIRED" ? "Sign In" : "Retry"}
          </a>
        </div>
      </div>
    );
  }

  return <DashboardClient progress={progress} />;
}
