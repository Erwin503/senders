import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { KNEX } from '../database/database.module';
import type { Db } from '../database/knex.type';
import type { AuthUser, UserRole } from './auth.types';

const scrypt = promisify(scryptCallback);

type UserRow = {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  role: UserRole;
  updated_at?: Date | string;
};

@Injectable()
export class AuthService {
  constructor(@Inject(KNEX) private readonly db: Db) {}

  async register(input: { username: string; displayName?: string; password: string }) {
    const username = input.username.trim().toLocaleLowerCase('en-US');
    if (username.length < 3) throw new BadRequestException('Логин должен содержать не менее 3 символов');
    const existing = await this.db<UserRow>('users').where({ username }).first();
    if (existing) throw new ConflictException('Логин уже занят');

    const [id] = await this.db<UserRow>('users').insert({
      username,
      display_name: input.displayName?.trim() || username,
      password_hash: await this.hashPassword(input.password),
      role: 'manager'
    });
    if (Number(id) === 1) await this.db<UserRow>('users').where({ id }).update({ role: 'admin' });
    const user = await this.db<UserRow>('users').where({ id }).first();
    if (!user) throw new UnauthorizedException();
    return this.publicUser(user);
  }

  async login(usernameInput: string, password: string) {
    const username = usernameInput.trim().toLocaleLowerCase('en-US');
    const user = await this.db<UserRow>('users').where({ username }).first();
    if (!user || !await this.verifyPassword(password, user.password_hash)) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.db('sessions').insert({ token_hash: this.hashToken(token), user_id: user.id, expires_at: expiresAt });
    return { token, expiresAt, user: this.publicUser(user) };
  }

  async logout(token?: string) {
    if (token) await this.db('sessions').where({ token_hash: this.hashToken(token) }).delete();
  }

  async getUserFromToken(token: string): Promise<AuthUser | null> {
    const user = await this.db<UserRow>('users')
      .join('sessions', 'users.id', 'sessions.user_id')
      .where('sessions.token_hash', this.hashToken(token))
      .where('sessions.expires_at', '>', this.db.fn.now())
      .select('users.id', 'users.username', 'users.display_name', 'users.role')
      .first() as UserRow | undefined;
    return user ? this.publicUser(user) : null;
  }

  async listUsers() {
    const rows = await this.db<UserRow>('users').select('id', 'username', 'display_name', 'role').orderBy('display_name');
    return rows.map((row) => this.publicUser(row));
  }

  async listAdmins() {
    const rows = await this.db<UserRow>('users').where({ role: 'admin' }).select('id', 'display_name').orderBy('display_name');
    return rows.map((row) => ({ id: row.id, name: row.display_name }));
  }

  async updateRole(id: number, role: UserRole) {
    const current = await this.db<UserRow>('users').where({ id }).first();
    if (!current) return null;
    if (current.role === 'admin' && role !== 'admin') {
      const admins = await this.db<UserRow>('users').where({ role: 'admin' }).count<{ count: number }[]>({ count: '*' });
      if (Number(admins[0]?.count ?? 0) <= 1) {
        throw new ConflictException('Нельзя убрать роль у последнего администратора');
      }
    }
    await this.db<UserRow>('users').where({ id }).update({ role, updated_at: this.db.fn.now() });
    const user = await this.db<UserRow>('users').where({ id }).first();
    return user ? this.publicUser(user) : null;
  }

  private async hashPassword(password: string) {
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, 64) as Buffer;
    return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
  }

  private async verifyPassword(password: string, encoded: string) {
    const [algorithm, saltText, hashText] = encoded.split('$');
    if (algorithm !== 'scrypt' || !saltText || !hashText) return false;
    const expected = Buffer.from(hashText, 'base64url');
    const actual = await scrypt(password, Buffer.from(saltText, 'base64url'), expected.length) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private publicUser(user: Pick<UserRow, 'id' | 'username' | 'display_name' | 'role'>): AuthUser {
    return { id: user.id, username: user.username, name: user.display_name, role: user.role };
  }
}
