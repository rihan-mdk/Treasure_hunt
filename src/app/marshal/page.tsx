import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAuthenticatedMarshal } from "@/lib/server/authGuard";
import MarshalClient from "./MarshalClient";

export const metadata: Metadata = {
  title: "Marshal Portal | The Hunt Expedition",
  description: "Authoritative ground marshal verification portal for physical treasure claims.",
};

export const instant = false;


export default async function MarshalPage() {
  const session = await getAuthenticatedMarshal();
  if (!session) {
    redirect("/marshal/login");
  }

  return <MarshalClient />;
}
