import type { Store } from "./database";
import { verifyPassword } from "./security";

/** Authentication returns only a stable business user ID. Roles always come from the local store. */
export interface IdentityProvider {
  authenticate(credentials: {
    username: string;
    password: string;
  }): Promise<{ userId: string } | null>;
}

export class LocalIdentityProvider implements IdentityProvider {
  constructor(private readonly store: Store) {}
  async authenticate(credentials: { username: string; password: string }) {
    const row = this.store.db
      .prepare("SELECT id,password_hash,active FROM users WHERE username=?")
      .get(credentials.username) as
      { id: string; password_hash: string; active: number } | undefined;
    // Equal password work for unknown accounts reduces account enumeration.
    const valid = await verifyPassword(
      credentials.password,
      row?.password_hash || "0".repeat(32) + ":" + "00".repeat(64),
    );
    return row?.active && valid ? { userId: row.id } : null;
  }
}
