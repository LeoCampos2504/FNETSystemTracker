import type { AuthSession, User } from "@/contracts";
import type { BackendRepositories } from "@/server/ports";
import { repositories as defaultRepositories } from "@/server/container";
import { verifyPassword } from "@/server/auth/password";
import { signSession } from "@/server/auth/jwt";
import { notAuthenticated } from "@/server/http/errors";

export interface AuthService {
  login(email: string, password: string): Promise<{ session: AuthSession; token: string }>;
  getUserById(userId: string): Promise<User | null>;
}

type AuthRepositories = Pick<BackendRepositories, "user" | "authCredentials">;

/**
 * Pure factory: depends only on the `user`/`authCredentials` ports. Gino's
 * Prisma layer will need an `AuthCredentialsRepository` adapter of its own —
 * see docs/PRISMA_INTEGRATION_CHECKLIST.md.
 */
export function createAuthService(repositories: AuthRepositories): AuthService {
  return {
    async login(email, password) {
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
    },

    async getUserById(userId) {
      return repositories.user.findById(userId);
    },
  };
}

// Default instance bound to the app's default (memory, for now) repositories
// — preserves today's call sites (flat function imports) untouched.
const defaultAuthService = createAuthService(defaultRepositories);
export const { login, getUserById } = defaultAuthService;
