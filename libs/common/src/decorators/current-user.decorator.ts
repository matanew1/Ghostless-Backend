/**
 * @file Parameter decorator to read JWT payload from the request.
 * @module @ghostless/common
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Claims extracted from the access JWT after {@link JwtAuthGuard} runs. */
export interface JwtPayload {
  /** User id (UUID). */
  sub: string;
  email?: string;
}

/**
 * Injects the authenticated user from `request.user`.
 * Must be used with {@link JwtAuthGuard}.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user;
  },
);
