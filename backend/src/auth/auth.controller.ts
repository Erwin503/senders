import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, UpdateRoleDto } from './auth.dto';
import { ForbiddenException } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const user = await this.auth.register(dto);
    await this.setSession(dto.username, dto.password, response);
    return user;
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.login(dto.username, dto.password);
    this.setCookie(response, session.token, session.expiresAt);
    return session.user;
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.sessionToken);
    response.setHeader('Set-Cookie', this.clearCookie());
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return request.user;
  }

  @Get('users')
  @UseGuards(AuthGuard)
  users(@Req() request: AuthenticatedRequest) {
    this.requireAdmin(request);
    return this.auth.listUsers();
  }

  @Patch('users/:id/role')
  @UseGuards(AuthGuard)
  async updateRole(@Req() request: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    this.requireAdmin(request);
    const user = await this.auth.updateRole(id, dto.role);
    if (!user) throw new ForbiddenException('Пользователь не найден');
    return user;
  }

  @Get('admins')
  @UseGuards(AuthGuard)
  admins() {
    return this.auth.listAdmins();
  }

  private requireAdmin(request: AuthenticatedRequest) {
    if (request.user.role !== 'admin') throw new ForbiddenException();
  }

  private async setSession(username: string, password: string, response: Response) {
    const session = await this.auth.login(username, password);
    this.setCookie(response, session.token, session.expiresAt);
  }

  private setCookie(response: Response, token: string, expiresAt: Date) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    response.setHeader('Set-Cookie', `kanban_session=${encodeURIComponent(token)}; Path=/api; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`);
  }

  private clearCookie() {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `kanban_session=; Path=/api; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  }
}
