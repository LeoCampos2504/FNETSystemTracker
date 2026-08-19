/**
 * Password storage is deliberately kept out of the `User` contract (it's an
 * internal auth concern, never exposed to the frontend), so it gets its own
 * small port instead of living on UserRepository.
 */
export interface AuthCredentialsRepository {
  getPasswordHash(userId: string): Promise<string | null>;
}
