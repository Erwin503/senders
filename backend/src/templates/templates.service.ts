import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { KNEX } from '../database/database.module';
import type { Db } from '../database/knex.type';
import type { AuthUser } from '../auth/auth.types';
import type { CreateTemplateDto, UpdateTemplateDto } from './templates.dto';

type TemplateRow = {
  id: number;
  owner_admin_id: number;
  created_by_user_id: number;
  owner_name: string;
  order_type: 'income' | 'expense' | 'store';
  address: string;
  description: string | null;
  active_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  usage_count: number;
};

@Injectable()
export class TemplatesService {
  constructor(@Inject(KNEX) private readonly db: Db) {}

  async list(user: AuthUser) {
    this.ensureTemplateRole(user);
    const query = this.db<TemplateRow>('order_templates')
      .join('users as owners', 'order_templates.owner_admin_id', 'owners.id')
      .select('order_templates.*', 'owners.display_name as owner_name')
      .orderBy([{ column: 'order_templates.usage_count', order: 'desc' }, { column: 'order_templates.created_at', order: 'desc' }])
      .where('order_templates.created_by_user_id', user.id);
    const rows = await query;
    return rows.map((row) => this.serialize(row));
  }

  async create(user: AuthUser, dto: CreateTemplateDto) {
    this.ensureTemplateRole(user);
    const [id] = await this.db('order_templates').insert({
      owner_admin_id: user.id,
      created_by_user_id: user.id,
      order_type: dto.orderType,
      address: dto.address.trim(),
      description: dto.description?.trim() || null,
      active_at: dto.activeAt ? new Date(dto.activeAt) : null
    });
    return this.get(id, user);
  }

  async update(id: number, user: AuthUser, dto: UpdateTemplateDto) {
    await this.getOwnedTemplate(id, user);
    await this.db('order_templates').where({ id }).update({
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

  async recordUse(id: number, user: AuthUser) {
    await this.getOwnedTemplate(id, user);
    await this.db('order_templates').where({ id }).increment('usage_count', 1);
    return { ok: true };
  }

  private async get(id: number, user: AuthUser) {
    const row = await this.db<TemplateRow>('order_templates')
      .join('users as owners', 'order_templates.owner_admin_id', 'owners.id')
      .where('order_templates.id', id)
      .select('order_templates.*', 'owners.display_name as owner_name')
      .first();
    if (!row) throw new NotFoundException('Шаблон не найден');
    if (row.created_by_user_id !== user.id) throw new ForbiddenException();
    return this.serialize(row);
  }

  private async getOwnedTemplate(id: number, user: AuthUser) {
    this.ensureTemplateRole(user);
    const row = await this.db<TemplateRow>('order_templates').where({ id, created_by_user_id: user.id }).first();
    if (!row) throw new NotFoundException('Шаблон не найден');
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
      updatedAt: row.updated_at,
      usageCount: row.usage_count
    };
  }
}
