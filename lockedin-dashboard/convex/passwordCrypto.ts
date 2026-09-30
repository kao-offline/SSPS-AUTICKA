import { Scrypt } from 'lucia';
import bcrypt from 'bcryptjs';

const originalCrypto = new Scrypt();

// Existing Convex Auth accounts use Scrypt; imported/admin-created accounts
// use bcrypt. Preserve both formats without resetting other users' passwords.
export const passwordCrypto = {
  async hashSecret(password: string) { return bcrypt.hashSync(password, 10); },
  async verifySecret(password: string, hash: string) {
    if (/^\$2[aby]\$/.test(hash)) return bcrypt.compareSync(password, hash);
    return originalCrypto.verify(hash, password);
  },
};
