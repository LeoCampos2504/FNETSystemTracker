import { UserRole, type User } from "@/contracts";

/** Global database access stays limited to admins until per-user scopes are enforced. */
export function canAccessGlobalData(role: User["role"]): boolean {
  return role === UserRole.ADMIN;
}
