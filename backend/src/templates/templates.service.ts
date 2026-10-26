import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { KNEX } from '../database/database.module';
import type { Db } from '../database/knex.type';
import type { AuthUser } from '../auth/auth.types';
import type { CreateTemplateDto, UpdateTemplateDto } from './templates.dto';

type TemplateRow = {
  id: number;
  owner_admin_id: number;
  owner_name: string;
  order_type: 'income' | 'expense' | 'store';
  address: string;
  description: string | null;
  active_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

@Injectable()
export class TemplatesService {
  constructor(@Inject(KNEX) private readonly db: Db) {}

  async list(user: AuthUser) {
    this.ensureTemplateRole(user);
    let query = this.db<TemplateRow>('order_templates')
      .join('users as owners', 'order_templates.owner_admin_id', 'owners.id')
      .select('order_templates.*', 'owners.display_name as owner_name')
      .orderBy([{ column: 'owners.display_name' }, { column: 'order_templates.created_at', order: 'desc' }]);
    if (user.role === 'admin') query = query.where('order_templates.owner_admin_id', user.id) as typeof query;
    const rows = await query;
    return rows.map((row) => this.serialize(row));
  }

  async create(user: AuthUser, dto: CreateTemplateDto) {
    this.ensureTemplateRole(user);
    const ownerAdminId = user.role === 'admin' ? user.id : dto.ownerAdminId;
    if (!ownerAdminId || !await this.db('users').where({ id: ownerAdminId, role: 'admin' }).first()) {
      throw new NotFoundException('Администратор шаблона не найден');
    }
    const [id] = await this.db('order_templates').insert({
      owner_admin_id: ownerAdminId,
      created_by_user_id: user.id,
      order_type: dto.orderType,
      address: dto.address.trim(),
      description: dto.description?.trim() || null,
      active_at: dto.activeAt ? new Date(dto.activeAt) : null
    });
    return this.get(id, user);
  }

  async update(id: number, user: AuthUser, dto: UpdateTemplateDto) {
    const current = await this.getOwnedTemplate(id, user);
    const ownerAdminId = user.role === 'admin' ? current.owner_admin_id : dto.ownerAdminId ?? current.owner_admin_id;
    if (user.role === 'manager' && !await this.db('users').where({ id: ownerAdminId, role: 'admin' }).first()) {
      throw new NotFoundException('Администратор шаблона не найден');
    }
    await this.db('order_templates').where({ id }).update({
      owner_admin_id: ownerAdminId,
      order_type: dto.orderType,
      address: dto.address.trim(),
      description: dto.description?.trim() || null,
      active_at: dto.activeAt ? new Date(dto.activeAt) : null,
      updated_at: this.db.fn.now()
    });
    return this.get(id, user);
  }

  async delete(id: number, user: AuthUser) {
    await this.getOwnedTemplate(id, user);
    await this.db('order_templates').where({ id }).delete();
    return { ok: true };
  }

  private async get(id: number, user: AuthUser) {
    const row = await this.db<TemplateRow>('order_templates')
      .join('users as owners', 'order_templates.owner_admin_id', 'owners.id')
      .where('order_templates.id', id)
      .select('order_templates.*', 'owners.display_name as owner_name')
      .first();
    if (!row) throw new NotFoundException('Шаблон не найден');
    if (user.role === 'admin' && row.owner_admin_id !== user.id) throw new ForbiddenException();
    return this.serialize(row);
  }

  private async getOwnedTemplate(id: number, user: AuthUser) {
    this.ensureTemplateRole(user);
    const row = await this.db<TemplateRow>('order_templates').where({ id }).first();
    if (!row) throw new NotFoundException('Шаблон не найден');
    if (user.role === 'admin' && row.owner_admin_id !== user.id) throw new ForbiddenException();
    return row;
  }

  private ensureTemplateRole(user: AuthUser) {
    if (!['admin', 'manager'].includes(user.role)) throw new ForbiddenException();
  }

  private serialize(row: TemplateRow) {
    return {
      id: row.id,
      ownerAdminId: row.owner_admin_id,
      ownerName: row.owner_name,
      orderType: row.order_type,
      address: row.address,
      description: row.description,
      activeAt: row.active_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
