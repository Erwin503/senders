import { Injectable } from '@nestjs/common';

type TelegramResponse<T> = { ok: boolean; result: T; description?: string };

@Injectable()
export class TelegramApiService {
  private get token() {
    return process.env.TELEGRAM_BOT_TOKEN?.trim();
  }

  get configured() {
    return Boolean(this.token);
  }

  async call<T>(method: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    if (!this.token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    });
    const result = (await response.json()) as TelegramResponse<T>;
    if (!response.ok || !result.ok) {
      throw new Error(result.description ?? `Telegram API returned HTTP ${response.status}`);
    }
    return result.result;
  }

  setMessageReaction(chatId: string, messageId: number, emoji: string) {
    return this.call<boolean>('setMessageReaction', {
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: 'emoji', emoji }]
    });
  }

  sendMessage(chatId: string, text: string, replyToMessageId?: number) {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      ...(replyToMessageId ? { reply_parameters: { message_id: replyToMessageId } } : {})
    });
  }
}
