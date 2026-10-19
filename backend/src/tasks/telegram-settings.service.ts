import { Inject, Injectable } from '@nestjs/common';
import { KNEX } from '../database/database.module';
import type { Db } from '../database/knex.type';

type SettingRow = { key: string; value: string };

@Injectable()
export class TelegramSettingsService {
  constructor(@Inject(KNEX) private readonly db: Db) {}

  async getGroupId() {
    const setting = await this.db<SettingRow>('telegram_settings').where({ key: 'group_id' }).first();
    return setting?.value?.trim() || process.env.TELEGRAM_GROUP_ID?.trim() || '';
  }

  async setGroupId(groupId: string) {
    await this.db<SettingRow>('telegram_settings')
      .insert({ key: 'group_id', value: groupId })
      .onConflict('key')
      .merge(['value']);
  }
}
