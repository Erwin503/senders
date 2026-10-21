import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { TasksService } from './tasks.service';
import { TelegramApiService } from './telegram-api.service';
import { TelegramSettingsService } from './telegram-settings.service';

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  is_bot?: boolean;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  caption?: string;
  chat: { id: number | string; type: string };
  from?: TelegramUser;
  entities?: TelegramEntity[];
  caption_entities?: TelegramEntity[];
};

type TelegramEntity = {
  type: string;
  offset: number;
  length: number;
  user?: TelegramUser;
};

type TelegramUpdate = { update_id: number; message?: TelegramMessage };
type TelegramBotUser = { id: number; username: string };

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private stopped = false;
  private controller?: AbortController;
  private botUsername = '';
  private botId?: number;
  private lastIdleLogAt = 0;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private refreshInProgress = false;
  private readonly logFile = resolve(
    process.cwd(),
    process.env.TELEGRAM_LOG_FILE ?? 'logs/telegram-bot.log'
  );

  constructor(
    private readonly telegram: TelegramApiService,
    private readonly tasks: TasksService,
    private readonly settings: TelegramSettingsService
  ) {}

  onModuleInit() {
    this.writeLog('startup', { configured: this.telegram.configured, logFile: this.logFile });
    if (!this.telegram.configured) {
      this.logger.warn('Telegram bot is idle: set TELEGRAM_BOT_TOKEN to enable group intake');
      this.writeLog('idle', { reason: 'TELEGRAM_BOT_TOKEN is not configured' });
      return;
    }
    this.refreshTimer = setInterval(() => void this.checkDailyRefresh(), 60_000);
    void this.checkDailyRefresh();
    void this.poll();
  }

  onModuleDestroy() {
    this.stopped = true;
    this.controller?.abort();
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  private async checkDailyRefresh() {
    if (this.stopped || this.refreshInProgress || !this.telegram.configured) return;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
    const date = `${part('year')}-${part('month')}-${part('day')}`;
    if (Number(part('hour')) < 10) return;

    this.refreshInProgress = true;
    try {
      if ((await this.settings.getValue('last_order_refresh_date')) === date) return;
      const refreshed = await this.tasks.refreshTelegramMessagesForActiveOrders();
      if (!refreshed) return;
      await this.settings.setValue('last_order_refresh_date', date);
      this.writeLog('daily_order_messages_refreshed', { date });
    } catch (error) {
      this.writeLog('daily_order_refresh_failed', { date, error: this.errorMessage(error) });
    } finally {
      this.refreshInProgress = false;
    }
  }

  private async poll() {
    let offset: number | undefined;
    while (!this.stopped) {
      this.controller = new AbortController();
      try {
        if (!this.botUsername) {
          const bot = await this.telegram.call<TelegramBotUser>('getMe', {});
          this.botUsername = bot.username;
          this.botId = bot.id;
          this.logger.log(`Listening for mentions of @${this.botUsername}`);
          this.writeLog('connected', { username: this.botUsername, botId: this.botId });
        }

        const updates = await this.telegram.call<TelegramUpdate[]>(
          'getUpdates',
          { offset, timeout: 25, allowed_updates: ['message'] },
          this.controller.signal
        );
        if (updates.length) {
          this.writeLog('updates_received', { count: updates.length });
        } else if (Date.now() - this.lastIdleLogAt > 60_000) {
          this.lastIdleLogAt = Date.now();
          this.writeLog('polling_idle', { message: 'No Telegram updates received during the last polling interval' });
        }
        for (const update of updates) {
          offset = update.update_id + 1;
          try {
            if (update.message) await this.handleMessage(update.message);
          } catch (error) {
            const message = this.errorMessage(error);
            this.logger.error(`Could not process update ${update.update_id}: ${message}`);
            this.writeLog('update_error', { updateId: update.update_id, error: message });
          }
        }
      } catch (error) {
        if (!this.stopped) {
          this.logger.error(`Telegram polling failed: ${this.errorMessage(error)}`);
          this.writeLog('polling_error', { error: this.errorMessage(error) });
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    }
  }

  private async handleMessage(message: TelegramMessage) {
    const chatId = String(message.chat.id);
    const rawSourceText = message.text ?? message.caption ?? '';
    const sourceText = rawSourceText.trim();
    const entities = message.entities ?? message.caption_entities ?? [];
    const senderName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ').trim()
      || message.from?.username
      || (message.from ? String(message.from.id) : 'unknown');
    this.writeLog('message_received', {
      chatId,
      chatType: message.chat.type,
      messageId: message.message_id,
      senderName,
      senderId: message.from?.id,
      isBot: message.from?.is_bot ?? false,
      text: sourceText,
      entities: entities.map(({ type, offset, length, user }) => ({ type, offset, length, userId: user?.id, username: user?.username }))
    });

    if (!message.from || message.from.is_bot || !['group', 'supergroup'].includes(message.chat.type)) {
      this.writeLog('message_ignored', { chatId, messageId: message.message_id, reason: 'not a human group message' });
      return;
    }
    const chatIdCommand = new RegExp(`^\\/chatid(?:@${this.escapeRegex(this.botUsername)})?(?:\\s|$)`, 'i');
    if (chatIdCommand.test(sourceText)) {
      await this.telegram.sendMessage(chatId, `ID этой беседы: ${chatId}`, message.message_id);
      this.writeLog('chat_id_replied', { chatId, messageId: message.message_id });
      return;
    }

    const setChatIdCommand = new RegExp(`^\\/setchatid(?:@${this.escapeRegex(this.botUsername)})?(?:\\s|$)`, 'i');
    if (setChatIdCommand.test(sourceText)) {
      this.writeLog('group_setup_requested', { chatId, senderId: message.from.id, senderName });
      try {
        await this.settings.setGroupId(chatId);
        await this.telegram.sendMessage(chatId, `Эта беседа подключена для заявок: ${chatId}`, message.message_id);
        this.writeLog('group_configured', { chatId, senderId: message.from.id, senderName });
      } catch (error) {
        const errorText = this.errorMessage(error);
        this.writeLog('group_setup_failed', { chatId, senderId: message.from.id, error: errorText });
        await this.telegram.sendMessage(
          chatId,
          'Не удалось подключить эту беседу. Убедитесь, что бот может отправлять сообщения в группе.',
          message.message_id
        );
      }
      return;
    }

    const allowedChat = await this.settings.getGroupId();
    if (allowedChat && allowedChat !== chatId) {
      this.writeLog('message_ignored', { chatId, messageId: message.message_id, reason: 'group id mismatch', allowedChat });
      return;
    }

    const mentionRanges = this.botMentionRanges(rawSourceText, entities);
    if (!mentionRanges.length) {
      this.writeLog('message_ignored', {
        chatId,
        messageId: message.message_id,
        reason: 'bot mention not found',
        expectedUsername: this.botUsername,
        entityTypes: entities.map(({ type }) => type)
      });
      return;
    }

    const textWithoutMention = this.removeMentionRanges(rawSourceText, mentionRanges).trim();
    const lines = textWithoutMention
      .split(/\r?\n/)
      .map((line) => line.trim());
    const address = lines[0];
    if (!address) {
      await this.telegram.sendMessage(chatId, 'Не вижу адрес доставки в первой строке.', message.message_id);
      this.writeLog('message_rejected', { chatId, messageId: message.message_id, reason: 'empty address' });
      return;
    }
    const orderTypeLabel = (lines[2] ?? '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
    const hasExpenseType = /(?:^|[^\p{L}])везем(?:$|[^\p{L}])/u.test(orderTypeLabel);
    const hasIncomeType = /(?:^|[^\p{L}])забираем(?:$|[^\p{L}])/u.test(orderTypeLabel);
    const hasStoreType = /(?:^|[^\p{L}])(?:магазин|оставить)(?:$|[^\p{L}])/u.test(orderTypeLabel);
    const matches = [hasExpenseType, hasIncomeType, hasStoreType].filter(Boolean).length;
    if (matches !== 1) {
      await this.telegram.sendMessage(
        chatId,
        'В третьей строке укажите тип заказа: «везём» (расход), «забираем» (приход) или «магазин» (оставить на магазине).',
        message.message_id
      );
      this.writeLog('message_rejected', { chatId, messageId: message.message_id, reason: 'invalid or missing order type', typeLine: lines[2] ?? '' });
      return;
    }

    try {
      await this.tasks.createFromTelegram({
        address,
        comment: lines[1] ?? '',
        orderType: hasIncomeType ? 'income' : hasStoreType ? 'store' : 'expense',
        sourceText,
        chatId,
        messageId: message.message_id,
        senderId: String(message.from.id),
        senderName
      });
    } catch (error) {
      const messageText = this.errorMessage(error);
      this.writeLog('order_creation_failed', {
        chatId,
        messageId: message.message_id,
        senderName,
        error: messageText
      });
      await this.telegram.sendMessage(
        chatId,
        'Не удалось создать заявку. Проверьте журнал backend или обратитесь к администратору.',
        message.message_id
      );
      return;
    }
    this.writeLog('order_created', {
      chatId, messageId: message.message_id, senderName, address,
      orderType: hasIncomeType ? 'income' : hasStoreType ? 'store' : 'expense'
    });
  }

  private writeLog(event: string, details: Record<string, unknown> = {}) {
    const entry = JSON.stringify({ timestamp: new Date().toISOString(), event, ...details });
    try {
      mkdirSync(dirname(this.logFile), { recursive: true });
      appendFileSync(this.logFile, `${entry}\n`, 'utf8');
    } catch (error) {
      this.logger.error(`Could not write Telegram log file ${this.logFile}: ${this.errorMessage(error)}`);
    }
    this.logger.log(`[telegram] ${entry}`);
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private botMentionRanges(text: string, entities: TelegramEntity[]) {
    const ranges: Array<{ offset: number; length: number }> = [];
    const pattern = new RegExp(`@${this.escapeRegex(this.botUsername)}\\b`, 'gi');
    for (const match of text.matchAll(pattern)) {
      if (match.index !== undefined) ranges.push({ offset: match.index, length: match[0].length });
    }
    for (const entity of entities) {
      const mentionedText = text.slice(entity.offset, entity.offset + entity.length);
      const isBotMention = entity.type === 'text_mention'
        ? entity.user?.id === this.botId
        : entity.type === 'mention' && mentionedText.toLocaleLowerCase() === `@${this.botUsername}`.toLocaleLowerCase();
      if (isBotMention) ranges.push({ offset: entity.offset, length: entity.length });
    }
    return ranges
      .sort((left, right) => left.offset - right.offset)
      .filter((range, index, list) => index === 0
        || range.offset !== list[index - 1].offset
        || range.length !== list[index - 1].length);
  }

  private removeMentionRanges(text: string, ranges: Array<{ offset: number; length: number }>) {
    let result = text;
    for (const range of [...ranges].sort((left, right) => right.offset - left.offset)) {
      result = result.slice(0, range.offset) + result.slice(range.offset + range.length);
    }
    return result;
  }

  private errorMessage(error: unknown) {
    if (!(error instanceof Error)) return String(error);
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) {
      const code = 'code' in cause ? String(cause.code) : '';
      return `${error.message}: ${code ? `${code}: ` : ''}${cause.message}`;
    }
    return error.message;
  }
}
