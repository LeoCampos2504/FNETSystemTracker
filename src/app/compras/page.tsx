import { redirect } from "next/navigation";
import { canAccessGlobalData } from "@/server/access";
import { getCurrentSessionUser } from "@/server/services/auth-sessions";
import { MendelPurchases } from "@/components/mendel-purchases";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const user = await getCurrentSessionUser();
  if (!user) redirect("/");
  if (!canAccessGlobalData(user.role)) redirect("/");
  return <MendelPurchases />;
}
