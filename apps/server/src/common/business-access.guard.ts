import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { SessionUser } from '@job-program/shared';
import { IS_PUBLIC_KEY } from '../modules/auth/public.decorator';
import { BusinessesService } from '../modules/businesses/businesses.service';

/**
 * 요청 쿼리/바디에 businessId가 실려 있으면 현재 로그인 사용자가 그 사업에 접근 가능한지 검증한다.
 * businessId가 없는 요청(사업 스코프 적용 전 라우트 등)은 그대로 통과시킨다.
 */
@Injectable()
export class BusinessAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly businessesService: BusinessesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    const businessId =
      (request.query?.businessId as string | undefined) ??
      ((request.body as Record<string, unknown> | undefined)?.businessId as string | undefined);
    if (!businessId || !request.user) return true;

    await this.businessesService.assertAccess(request.user, businessId);
    return true;
  }
}
