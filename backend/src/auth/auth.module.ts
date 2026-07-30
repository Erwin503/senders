import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TelegramAuthGuard } from './telegram-auth.guard';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: TelegramAuthGuard
    }
  ]
})
export class AuthModule {}