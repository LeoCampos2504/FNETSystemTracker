/**
 * Port for reading login credentials, kept separate from UserRepository so
 * the password hash never has to travel through the general-purpose User
 * read path (UserRepository.findById/findByEmail return the domain User
 * shape, which has no passwordHash field at all — see src/contracts/user.ts).
 *
 * This port only reads. Verifying a password against the hash (bcrypt
 * compare) and any active/inactive login policy belong to AuthService
 * (Leo), not to the repository layer.
 */
export interface AuthCredentialsRepository {
  /** Returns the stored password hash for a user, or null if the user doesn't exist. */
  getPasswordHash(userId: string): Promise<string | null>;
}
