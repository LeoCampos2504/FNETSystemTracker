import type { AuthSession, User } from "@/contracts";
import { repositories } from "@/server/container";
import { verifyPassword } from "@/server/auth/password";
import { signSession } from "@/server/auth/jwt";
import { notAuthenticated } from "@/server/http/errors";

export async function login(email: string, password: string): Promise<{ session: AuthSession; token: string }> {
  const user = await repositories.user.findByEmail(email);
  if (!user || !user.active) throw notAuthenticated("Invalid credentials");

  const passwordHash = await repositories.authCredentials.getPasswordHash(user.id);
  if (!passwordHash || !verifyPassword(password, passwordHash)) {
    throw notAuthenticated("Invalid credentials");
  }

  const { token, expiresAt } = await signSession({
    sub: user.id,
    role: user.role,
    technicianId: user.technicianId,
    coordinatorId: user.coordinatorId,
  });

  return { session: { user, token, expiresAt }, token };
}

export async function getUserById(userId: string): Promise<User | null> {
  return repositories.user.findById(userId);
}
