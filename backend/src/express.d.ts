import { AuthUser } from './auth/auth-user';

// Расширение Express.Request полями, которые кладёт SessionGuard.
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionToken?: string;
    }
  }
}
