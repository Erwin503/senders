import { createHmac, timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { TelegramUser } from './telegram-user.type';

@Injectable()
export class TelegramAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { telegramUser?: TelegramUser }>();
    const user = this.resolveUser(request);
    const allowedIds = this.allowedUserIds();

    if (!allowedIds.has(user.id)) {
      throw new ForbiddenException('Telegram user is not in whitelist');
    }

    request.telegramUser = user;
    return true;
  }

  private resolveUser(request: Request): TelegramUser {
    const initData = request.header('x-telegram-init-data');
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (initData && botToken) {
      return this.parseAndVerifyInitData(initData, botToken);
    }

    const devUserId = process.env.DEV_TELEGRAM_USER_ID;
    if (devUserId) {
      return {
        id: devUserId,
        name: process.env.DEV_TELEGRAM_USER_NAME ?? 'Local User',
        username: process.env.DEV_TELEGRAM_USERNAME
      };
    }

    throw new UnauthorizedException('Telegram init data is required');
  }

  private parseAndVerifyInitData(initData: string, botToken: string): TelegramUser {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    const userJson = params.get('user');

    if (!hash || !userJson) {
      throw new UnauthorizedException('Invalid Telegram init data');
    }

    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (!this.safeCompare(hash, expectedHash)) {
      throw new UnauthorizedException('Telegram init data signature mismatch');
    }

    const user = JSON.parse(userJson) as {
      id: number | string;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();

    return {
      id: String(user.id),
      name: name || user.username || String(user.id),
      username: user.username
    };
  }

  private allowedUserIds() {
    return new Set(
      (process.env.TELEGRAM_ALLOWED_USER_IDS ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    );
  }

  private safeCompare(a: string, b: string) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);

    return left.length === right.length && timingSafeEqual(left, right);
  }
}