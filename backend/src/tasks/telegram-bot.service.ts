import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TelegramApiService } from './telegram-api.service';

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
};

type TelegramUpdate = { update_id: number; message?: TelegramMessage };
type TelegramBotUser = { username: string };

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private stopped = false;
  private controller?: AbortController;
  private botUsername = '';

  constructor(
    private readonly telegram: TelegramApiService,
    private readonly tasks: TasksService
  ) {}

  onModuleInit() {
    if (!this.telegram.configured) {
      this.logger.warn('Telegram bot is idle: set TELEGRAM_BOT_TOKEN to enable group intake');
      return;
    }
    void this.poll();
  }

  onModuleDestroy() {
    this.stopped = true;
    this.controller?.abort();
  }

  private async poll() {
    let offset: number | undefined;
    while (!this.stopped) {
      this.controller = new AbortController();
      try {
        if (!this.botUsername) {
          const bot = await this.telegram.call<TelegramBotUser>('getMe', {});
          this.botUsername = bot.username;
          this.logger.log(`Listening for mentions of @${this.botUsername}`);
        }

        const updates = await this.telegram.call<TelegramUpdate[]>(
          'getUpdates',
          { offset, timeout: 25, allowed_updates: ['message'] },
          this.controller.signal
        );
        for (const update of updates) {
          offset = update.update_id + 1;
          try {
            if (update.message) await this.handleMessage(update.message);
          } catch (error) {
            this.logger.error(`Could not process update ${update.update_id}: ${this.errorMessage(error)}`);
          }
        }
      } catch (error) {
        if (!this.stopped) {
          this.logger.error(`Telegram polling failed: ${this.errorMessage(error)}`);
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    }
  }

  private async handleMessage(message: TelegramMessage) {
    if (!message.from || message.from.is_bot || !['group', 'supergroup'].includes(message.chat.type)) return;
    const chatId = String(message.chat.id);
    const allowedChat = process.env.TELEGRAM_GROUP_ID?.trim();
    if (allowedChat && allowedChat !== chatId) return;

    const sourceText = (message.text ?? message.caption ?? '').trim();
    const chatIdCommand = new RegExp(`^\\/chatid(?:@${this.escapeRegex(this.botUsername)})?(?:\\s|$)`, 'i');
    if (chatIdCommand.test(sourceText)) {
      await this.telegram.sendMessage(chatId, `ID этой беседы: ${chatId}`, message.message_id);
      return;
    }

    const mentionPattern = new RegExp(`@${this.escapeRegex(this.botUsername)}\\b`, 'i');
    if (!mentionPattern.test(sourceText)) return;

    const lines = sourceText
      .replace(new RegExp(`@${this.escapeRegex(this.botUsername)}\\b`, 'gi'), '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const address = lines[0];
    if (!address) {
      await this.telegram.sendMessage(chatId, 'Не вижу адрес доставки в первой строке.', message.message_id);
      return;
    }

    const senderName = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ').trim()
      || message.from.username
      || String(message.from.id);
    await this.tasks.createFromTelegram({
      address,
      comment: lines.slice(1).join('\n'),
      sourceText,
      chatId,
      messageId: message.message_id,
      senderId: String(message.from.id),
      senderName
    });
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
