import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { AuthenticatedRequest } from './auth.guard';
import { AuthGuard } from './auth.guard';

@Injectable()
export class AuthOrIntegrationGuard implements CanActivate {
  constructor(private readonly authGuard: AuthGuard) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const expectedKey = process.env.INTEGRATION_API_KEY;
    const suppliedKey = request.headers['x-api-key'];
    if (expectedKey && typeof suppliedKey === 'string' && this.matches(suppliedKey, expectedKey)) {
      request.user = { id: 0, username: 'integration', name: '1С', role: 'manager' };
      request.sessionToken = '';
      return true;
    }
    return this.authGuard.canActivate(context);
  }

  private matches(supplied: string, expected: string) {
    const left = Buffer.from(supplied);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
