import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';

export type AuthenticatedRequest = Request & { user: AuthUser; sessionToken: string };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.readCookie(request.headers.cookie, 'kanban_session');
    if (!token) throw new UnauthorizedException();
    const user = await this.auth.getUserFromToken(token);
    if (!user) throw new UnauthorizedException();
    request.user = user;
    request.sessionToken = token;
    return true;
  }

  private readCookie(header: string | undefined, name: string) {
    const value = header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
    return value ? decodeURIComponent(value.slice(name.length + 1)) : undefined;
  }
}
