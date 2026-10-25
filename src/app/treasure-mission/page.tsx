import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuthenticatedTeam } from "@/lib/server/authGuard";
import { getTeamProgressAction } from "@/app/actions/progressActions";
import TreasureMissionClient from "./TreasureMissionClient";

export const metadata: Metadata = {
  title: "Physical Cache — Final Mission | The Hunt",
  description: "All 45 cipher challenges cleared. Navigate to the physical cache and verify your discovery.",
};

export const instant = false;

export default async function TreasureMissionPage() {
  const teamCtx = await getAuthenticatedTeam();
  if (!teamCtx) {
    redirect("/login");
  }

  const progress = await getTeamProgressAction();

  if (!progress.success) {
    redirect(progress.error === "ERR_SESSION_EXPIRED" ? "/login" : "/dashboard");
  }

  // Only teams that completed all 45 questions can access this page
  if (!progress.completedAllLevels) {
    redirect("/dashboard");
  }

  return (
    <TreasureMissionClient
      teamCallsign={progress.callsign ?? "UNKNOWN"}
      totalSolved={progress.totalSolved ?? 45}
      totalTarget={progress.totalTarget}
    />
  );
}
