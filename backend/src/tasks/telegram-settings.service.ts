import { Inject, Injectable } from '@nestjs/common';
import { KNEX } from '../database/database.module';
import type { Db } from '../database/knex.type';

type SettingRow = { key: string; value: string };

@Injectable()
export class TelegramSettingsService {
  constructor(@Inject(KNEX) private readonly db: Db) {}

  async getGroupId() {
    return (await this.getValue('group_id'))?.trim() || process.env.TELEGRAM_GROUP_ID?.trim() || '';
  }

  async setGroupId(groupId: string) {
    await this.setValue('group_id', groupId);
  }

  async getValue(key: string) {
    const setting = await this.db<SettingRow>('telegram_settings').where({ key }).first();
    return setting?.value ?? null;
  }

  async setValue(key: string, value: string) {
    await this.db<SettingRow>('telegram_settings')
      .insert({ key, value })
      .onConflict('key')
      .merge(['value']);
  }
}
