import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** SessionAuthGuard를 건너뛰는 라우트에 붙인다 (로그인, 최초세팅 등). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
