import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { TelegramUser } from '../auth/telegram-user.type';
import { KNEX } from '../database/database.module';
import type { Db } from '../database/knex.type';
import { CreateColumnDto, CreateTaskDto, MoveTaskDto, UpdateColumnDto, UpdateTaskDto } from './dto';

type ColumnRow = {
  id: number;
  title: string;
  slug: string;
  position: number;
};

type TaskRow = {
  id: number;
  column_id: number;
  title: string;
  description: string | null;
  position: number;
  responsible_id: string | null;
  responsible_name: string | null;
  storekeeper_id: string | null;
  storekeeper_name: string | null;
  driver_id: string | null;
  driver_name: string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class TasksService {
  constructor(@Inject(KNEX) private readonly db: Db) {}

  async getBoard() {
    const [columns, tasks] = await Promise.all([
      this.db<ColumnRow>('columns').select('*').orderBy('position', 'asc'),
      this.db<TaskRow>('tasks').select('*').orderBy([{ column: 'column_id' }, { column: 'position' }])
    ]);

    return {
      columns: columns.map((column) => ({
        id: column.id,
        title: column.title,
        slug: column.slug,
        position: column.position,
        tasks: tasks
          .filter((task) => task.column_id === column.id)
          .map((task) => this.serializeTask(task))
      }))
    };
  }

  async createColumn(dto: CreateColumnDto) {
    const maxPosition = await this.db<ColumnRow>('columns').max<{ max: number | null }>('position as max').first();
    const [id] = await this.db<ColumnRow>('columns').insert({
      title: dto.title,
      slug: 'custom',
      position: (maxPosition?.max ?? -1) + 1
    });

    return this.db<ColumnRow>('columns').where({ id }).first();
  }

  async updateColumn(id: number, dto: UpdateColumnDto) {
    const updated = await this.db<ColumnRow>('columns').where({ id }).update(dto);
    if (!updated) {
      throw new NotFoundException('Column not found');
    }

    return this.db<ColumnRow>('columns').where({ id }).first();
  }

  async createTask(dto: CreateTaskDto, user: TelegramUser) {
    const column = dto.columnId
      ? await this.db<ColumnRow>('columns').where({ id: dto.columnId }).first()
      : await this.db<ColumnRow>('columns').orderBy('position', 'asc').first();

    if (!column) {
      throw new NotFoundException('Column not found');
    }

    const maxPosition = await this.db<TaskRow>('tasks')
      .where({ column_id: column.id })
      .max<{ max: number | null }>('position as max')
      .first();

    const [id] = await this.db<TaskRow>('tasks').insert({
      column_id: column.id,
      title: dto.title,
      description: dto.description ?? null,
      position: (maxPosition?.max ?? -1) + 1,
      responsible_id: user.id,
      responsible_name: user.name
    });

    const task = await this.db<TaskRow>('tasks').where({ id }).first();
    return task ? this.serializeTask(task) : task;
  }

  async updateTask(id: number, dto: UpdateTaskDto) {
    const updated = await this.db<TaskRow>('tasks')
      .where({ id })
      .update({
        ...dto,
        updated_at: this.db.fn.now()
      });

    if (!updated) {
      throw new NotFoundException('Task not found');
    }

    const task = await this.db<TaskRow>('tasks').where({ id }).first();
    return task ? this.serializeTask(task) : task;
  }

  async moveTask(id: number, dto: MoveTaskDto, user: TelegramUser) {
    return this.db.transaction(async (trx) => {
      const task = await trx<TaskRow>('tasks').where({ id }).first();
      const column = await trx<ColumnRow>('columns').where({ id: dto.columnId }).first();
      if (!task || !column) {
        throw new NotFoundException('Task or column not found');
      }

      const targetTasks = await trx<TaskRow>('tasks')
        .where({ column_id: dto.columnId })
        .whereNot({ id })
        .orderBy('position', 'asc');

      const nextTasks = [...targetTasks];
      nextTasks.splice(Math.min(dto.position, nextTasks.length), 0, { ...task, column_id: dto.columnId });

      await Promise.all(
        nextTasks.map((nextTask, position) => {
          const roleUpdate = nextTask.id === id ? this.roleUpdateForStage(column.slug, user) : {};

          return trx<TaskRow>('tasks')
            .where({ id: nextTask.id })
            .update({
              column_id: dto.columnId,
              position,
              updated_at: trx.fn.now(),
              ...roleUpdate
            });
        })
      );

      const moved = await trx<TaskRow>('tasks').where({ id }).first();
      return moved ? this.serializeTask(moved) : moved;
    });
  }

  async deleteTask(id: number) {
    const deleted = await this.db<TaskRow>('tasks').where({ id }).delete();
    if (!deleted) {
      throw new NotFoundException('Task not found');
    }

    return { ok: true };
  }

  private roleUpdateForStage(slug: string, user: TelegramUser) {
    if (slug === 'assembled') {
      return {
        storekeeper_id: user.id,
        storekeeper_name: user.name
      };
    }

    if (slug === 'shipped') {
      return {
        driver_id: user.id,
        driver_name: user.name
      };
    }

    return {};
  }

  private serializeTask(task: TaskRow) {
    return {
      id: task.id,
      columnId: task.column_id,
      title: task.title,
      description: task.description,
      position: task.position,
      responsible: task.responsible_id
        ? { id: task.responsible_id, name: task.responsible_name ?? task.responsible_id }
        : null,
      storekeeper: task.storekeeper_id
        ? { id: task.storekeeper_id, name: task.storekeeper_name ?? task.storekeeper_id }
        : null,
      driver: task.driver_id ? { id: task.driver_id, name: task.driver_name ?? task.driver_id } : null,
      createdAt: task.created_at,
      updatedAt: task.updated_at
    };
  }
}