import type { UserRole } from "./enums";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** Set when role === TECHNICIAN. */
  technicianId: string | null;
  /** Set when role === COORDINATOR. */
  coordinatorId: string | null;
  active: boolean;
}

export interface AuthSession {
  user: User;
  /** Opaque token for the http-api implementation (e.g. a signed JWT). */
  token: string;
  expiresAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}
