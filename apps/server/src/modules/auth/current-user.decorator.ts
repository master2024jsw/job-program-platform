import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionUser } from '@job-program/shared';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionUser => {
  const request = ctx.switchToHttp().getRequest<Request & { user: SessionUser }>();
  return request.user;
});
