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
  /** Present only in adapters that do not use an HttpOnly session cookie. */
  token?: string;
  expiresAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}
