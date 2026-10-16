import { redirect } from "next/navigation";
import { getCurrentSessionUser } from "@/server/services/auth-sessions";
import { MendelZoneTray } from "@/components/mendel-zone-tray";

export const dynamic = "force-dynamic";
export default async function MendelZoneTrayPage() {
  const user = await getCurrentSessionUser();
  if (!user || !user.active || !["ADMIN", "COORDINATOR"].includes(user.role)) redirect("/");
  return <MendelZoneTray admin={user.role === "ADMIN"} />;
}
