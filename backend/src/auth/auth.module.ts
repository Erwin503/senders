import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthOrIntegrationGuard } from './auth-or-integration.guard';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, AuthOrIntegrationGuard],
  exports: [AuthService, AuthGuard, AuthOrIntegrationGuard]
})
export class AuthModule {}
