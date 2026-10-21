import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { KNEX } from '../database/database.module';
import type { Db } from '../database/knex.type';
import { CreateColumnDto, CreateTaskDto, MoveTaskDto, UpdateColumnDto, UpdateTaskDto } from './dto';
import { TelegramApiService } from './telegram-api.service';
import { TelegramSettingsService } from './telegram-settings.service';

type SiteUser = { id: string; name: string };

type ColumnRow = {
  id: number;
  title: string;
  slug: string;
  order_type: 'income' | 'expense' | 'store';
  position: number;
};

type TaskRow = {
  id: number;
  column_id: number;
  order_type: 'income' | 'expense' | 'store';
  external_number: string | null;
  title: string;
  description: string | null;
  position: number;
  responsible_id: string | null;
  responsible_name: string | null;
  storekeeper_id: string | null;
  storekeeper_name: string | null;
  driver_id: string | null;
  driver_name: string | null;
  telegram_chat_id: string | null;
  telegram_message_id: number | null;
  telegram_message_text: string | null;
  telegram_message_sent_by_bot: boolean;
  telegram_source_chat_id: string | null;
  telegram_source_message_id: number | null;
  ready_at: Date | string | null;
  created_at: Date;
  updated_at: Date;
};

@Injectable()
export class TasksService {
  constructor(
    @Inject(KNEX) private readonly db: Db,
    private readonly telegram: TelegramApiService,
    private readonly settings: TelegramSettingsService
  ) {}

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
        orderType: column.order_type,
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

  async createTask(dto: CreateTaskDto, user: SiteUser, source?: { chatId: string; messageId: number; text: string }) {
    const orderType = dto.orderType ?? 'expense';
    const externalNumber = dto.externalNumber?.trim() || null;
    if (externalNumber) {
      const existing = await this.db<TaskRow>('tasks').where({ external_number: externalNumber }).first();
      if (existing) {
        if (existing.order_type !== orderType) {
          throw new ConflictException('This 1C number is already assigned to another order type');
        }
        return this.serializeTask(existing);
      }
    }
    const column = dto.columnId
      ? await this.db<ColumnRow>('columns').where({ id: dto.columnId }).first()
      : await this.db<ColumnRow>('columns').where({ order_type: orderType, slug: 'created' }).first();

    if (!column) {
      throw new NotFoundException('Column not found');
    }
    if (column.order_type !== orderType) {
      throw new NotFoundException('The selected stage does not belong to this order type');
    }

    const maxPosition = await this.db<TaskRow>('tasks')
      .where({ column_id: column.id })
      .max<{ max: number | null }>('position as max')
      .first();

    const [id] = await this.db<TaskRow>('tasks').insert({
      column_id: column.id,
      order_type: orderType,
      external_number: externalNumber,
      title: dto.title,
      description: dto.description ?? null,
      position: (maxPosition?.max ?? -1) + 1,
      responsible_id: user.id,
      responsible_name: user.name,
      ready_at: column.slug === 'ready' ? this.db.fn.now() : null,
      telegram_chat_id: source?.chatId ?? null,
      telegram_message_id: source?.messageId ?? null,
      telegram_message_text: source?.text ?? null,
      telegram_message_sent_by_bot: false
    });

    if (source) {
      await this.applyTelegramReaction(source.chatId, source.messageId, 'created');
    } else {
      try {
        await this.publishTaskToTelegram(id, column);
      } catch (error) {
        console.error(`Order ${id} was created but could not be posted to Telegram: ${this.errorMessage(error)}`);
      }
    }
    const task = await this.db<TaskRow>('tasks').where({ id }).first();
    return task ? this.serializeTask(task) : task;
  }

  async createFromTelegram(input: {
    address: string;
    comment: string;
    orderType: 'income' | 'expense' | 'store';
    sourceText: string;
    chatId: string;
    messageId: number;
    senderId: string;
    senderName: string;
  }) {
    const existing = await this.db<TaskRow>('tasks')
      .where({ telegram_chat_id: input.chatId, telegram_message_id: input.messageId })
      .first();
    if (existing) return this.serializeTask(existing);

    const column = await this.db<ColumnRow>('columns').where({ slug: 'created', order_type: input.orderType }).first();
    if (!column) throw new NotFoundException('Created stage not found');

    const maxPosition = await this.db<TaskRow>('tasks')
      .where({ column_id: column.id })
      .max<{ max: number | null }>('position as max')
      .first();
    const [id] = await this.db<TaskRow>('tasks').insert({
      column_id: column.id,
      order_type: input.orderType,
      title: input.address,
      description: input.comment || null,
      position: (maxPosition?.max ?? -1) + 1,
      responsible_id: input.senderId,
      responsible_name: input.senderName,
      telegram_chat_id: input.chatId,
      telegram_message_id: input.messageId,
      telegram_message_text: input.sourceText,
      telegram_source_chat_id: input.chatId,
      telegram_source_message_id: input.messageId,
      telegram_message_sent_by_bot: false
    });

    await this.applyTelegramReaction(input.chatId, input.messageId, 'created');
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
    if (!task) return task;
    const column = await this.db<ColumnRow>('columns').where({ id: task.column_id }).first();
    if (column) await this.syncTelegramAfterEdit(task, column);
    return this.serializeTask(task);
  }

  async moveTask(id: number, dto: MoveTaskDto, user: SiteUser) {
    const { moved, changedStage, stage } = await this.db.transaction(async (trx) => {
      const task = await trx<TaskRow>('tasks').where({ id }).first();
      const column = await trx<ColumnRow>('columns').where({ id: dto.columnId }).first();
      if (!task || !column) {
        throw new NotFoundException('Task or column not found');
      }
      if (task.order_type !== column.order_type) {
        throw new NotFoundException('Orders cannot be moved between income and expense boards');
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
              ...(nextTask.id === id && task.column_id !== column.id
                ? { ready_at: column.slug === 'ready' ? trx.fn.now() : null }
                : {}),
              ...roleUpdate
            });
        })
      );

      const moved = await trx<TaskRow>('tasks').where({ id }).first();
      return { moved, changedStage: task.column_id !== column.id, stage: column.slug };
    });

    if (changedStage && moved?.telegram_chat_id && moved.telegram_message_id) {
      await this.applyTelegramReaction(moved.telegram_chat_id, moved.telegram_message_id, stage);
    }
    return moved ? this.serializeTask(moved) : moved;
  }

  async moveTaskByExternalNumber(externalNumber: string, dto: MoveTaskDto, user: SiteUser) {
    const task = await this.db<TaskRow>('tasks').where({ external_number: externalNumber }).first();
    if (!task) throw new NotFoundException('Task with this 1C number was not found');
    return this.moveTask(task.id, dto, user);
  }

  async deleteTask(id: number) {
    const task = await this.db<TaskRow>('tasks').where({ id }).first();
    if (!task) throw new NotFoundException('Task not found');

    const deleted = await this.db<TaskRow>('tasks').where({ id }).delete();
    if (!deleted) {
      throw new NotFoundException('Task not found');
    }

    await this.syncTelegramAfterDelete(task);

    return { ok: true };
  }

  async refreshTelegramMessagesForActiveOrders() {
    const groupId = await this.settings.getGroupId();
    if (!this.telegram.configured || !groupId) return false;

    const activeTasks = await this.db<TaskRow>('tasks')
      .join('columns', 'tasks.column_id', 'columns.id')
      .whereNotIn('columns.slug', ['ready', 'stocked'])
      .select('tasks.*', 'columns.slug as stage_slug', 'columns.title as stage_title') as Array<TaskRow & { stage_slug: string; stage_title: string }>;

    for (const task of activeTasks) {
      try {
        await this.publishTaskToTelegram(task.id, { slug: task.stage_slug, title: task.stage_title }, groupId);
      } catch (error) {
        console.error(`Could not refresh Telegram message for order ${task.id}: ${this.errorMessage(error)}`);
      }
    }
    return true;
  }

  private async publishTaskToTelegram(taskId: number, column: Pick<ColumnRow, 'slug' | 'title'>, groupId?: string) {
    if (!this.telegram.configured) return;
    const chatId = groupId ?? await this.settings.getGroupId();
    if (!chatId) return;

    const task = await this.db<TaskRow>('tasks').where({ id: taskId }).first();
    if (!task) return;

    if (task.telegram_message_sent_by_bot && task.telegram_chat_id && task.telegram_message_id) {
      try {
        await this.telegram.deleteMessage(task.telegram_chat_id, task.telegram_message_id);
      } catch (error) {
        console.warn(`Could not delete previous bot message for order ${task.id}: ${this.errorMessage(error)}`);
      }
    }

    const sent = await this.telegram.sendMessage(chatId, this.telegramTaskText(task, column));
    const sentChatId = String(sent.chat.id);
    const oldChatId = task.telegram_chat_id;
    const oldMessageId = task.telegram_message_id;
    const oldMessageWasBotSent = task.telegram_message_sent_by_bot;
    await this.db<TaskRow>('tasks').where({ id: task.id }).update({
      telegram_chat_id: sentChatId,
      telegram_message_id: sent.message_id,
      telegram_message_sent_by_bot: true,
      updated_at: this.db.fn.now()
    });
    if (!oldMessageWasBotSent && oldChatId && oldMessageId) {
      await this.clearTelegramReaction(oldChatId, oldMessageId);
    }
    await this.applyTelegramReaction(sentChatId, sent.message_id, column.slug);
  }

  private telegramTaskText(task: TaskRow, column: Pick<ColumnRow, 'slug' | 'title'>) {
    const actionLabel = task.order_type === 'income'
      ? 'Забираем'
      : task.order_type === 'store'
        ? 'Оставить на магазине'
        : 'Везём';
    return [
      task.title,
      actionLabel,
      `Комментарий: ${task.description?.trim() || '—'}`,
      `Статус: ${column.title}`,
      `Ответственный: ${task.responsible_name || '—'}`
    ].join('\n');
  }

  private async syncTelegramAfterEdit(task: TaskRow, column: ColumnRow) {
    if (!task.telegram_chat_id || !task.telegram_message_id) {
      try {
        await this.publishTaskToTelegram(task.id, column);
      } catch (error) {
        console.error(`Could not publish edited order ${task.id} to Telegram: ${this.errorMessage(error)}`);
      }
      return;
    }

    if (task.telegram_message_sent_by_bot) {
      try {
        await this.telegram.editMessageText(task.telegram_chat_id, task.telegram_message_id, this.telegramTaskText(task, column));
      } catch (error) {
        console.error(`Could not edit Telegram message for order ${task.id}: ${this.errorMessage(error)}`);
      }
      return;
    }

    const sourceChatId = task.telegram_source_chat_id ?? task.telegram_chat_id;
    const sourceMessageId = task.telegram_source_message_id ?? task.telegram_message_id;
    try {
      const sent = await this.telegram.sendMessage(sourceChatId, this.telegramTaskText(task, column), sourceMessageId);
      await this.db<TaskRow>('tasks').where({ id: task.id }).update({
        telegram_chat_id: String(sent.chat.id),
        telegram_message_id: sent.message_id,
        telegram_message_sent_by_bot: true,
        updated_at: this.db.fn.now()
      });
      await this.clearTelegramReaction(sourceChatId, sourceMessageId);
      await this.applyTelegramReaction(String(sent.chat.id), sent.message_id, column.slug);
    } catch (error) {
      console.error(`Could not send Telegram edit feedback for order ${task.id}: ${this.errorMessage(error)}`);
    }
  }

  private async syncTelegramAfterDelete(task: TaskRow) {
    const sourceChatId = task.telegram_source_chat_id ?? (!task.telegram_message_sent_by_bot ? task.telegram_chat_id : null);
    const sourceMessageId = task.telegram_source_message_id ?? (!task.telegram_message_sent_by_bot ? task.telegram_message_id : null);

    if (task.telegram_message_sent_by_bot && task.telegram_chat_id && task.telegram_message_id) {
      try {
        await this.telegram.deleteMessage(task.telegram_chat_id, task.telegram_message_id);
      } catch (error) {
        console.error(`Could not delete Telegram message for order ${task.id}: ${this.errorMessage(error)}`);
        try {
          await this.telegram.editMessageText(task.telegram_chat_id, task.telegram_message_id, `Заказ #${task.id} удалён из канбана.`);
        } catch (editError) {
          console.error(`Could not mark Telegram message for deleted order ${task.id}: ${this.errorMessage(editError)}`);
        }
      }
    }

    if (sourceChatId && sourceMessageId) {
      await this.clearTelegramReaction(sourceChatId, sourceMessageId);
      try {
        await this.telegram.sendMessage(sourceChatId, `Заказ #${task.id} удалён из канбана.`, sourceMessageId);
      } catch (error) {
        console.error(`Could not send Telegram delete feedback for order ${task.id}: ${this.errorMessage(error)}`);
      }
    }
  }

  private async clearTelegramReaction(chatId: string, messageId: number) {
    try {
      await this.telegram.clearMessageReaction(chatId, messageId);
    } catch (error) {
      console.error(`Could not clear Telegram reaction from message ${messageId}: ${this.errorMessage(error)}`);
    }
  }

  private roleUpdateForStage(slug: string, user: SiteUser) {
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
      orderType: task.order_type,
      externalNumber: task.external_number,
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
      telegramMessageText: task.telegram_message_text,
      readyAt: task.ready_at,
      createdAt: task.created_at,
      updatedAt: task.updated_at
    };
  }

  private async applyTelegramReaction(chatId: string, messageId: number, stage: string) {
    const emojiByStage: Record<string, string> = {
      created: '👍',
      assembled: '👌',
      shipped: '🚀',
      ready: '🎉',
      picked_up: '🚚',
      stocked: '✅'
    };
    const emoji = emojiByStage[stage];
    if (!emoji) return;

    try {
      await this.telegram.setMessageReaction(chatId, messageId, emoji);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('REACTION_INVALID') && emoji !== '👍') {
        try {
          await this.telegram.setMessageReaction(chatId, messageId, '👍');
          console.warn(`Reaction ${emoji} is unavailable in chat ${chatId}; used 👍 instead`);
          return;
        } catch (fallbackError) {
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          console.error(`Could not react to Telegram order message with ${emoji} or 👍: ${message}; ${fallbackMessage}`);
          return;
        }
      }
      console.error(`Could not react to Telegram order message with ${emoji}: ${message}`);
    }
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
