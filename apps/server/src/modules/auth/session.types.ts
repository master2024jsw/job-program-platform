import 'express-session';
import { UserRole } from '@job-program/shared';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    institutionId?: string;
    role?: UserRole;
  }
}
