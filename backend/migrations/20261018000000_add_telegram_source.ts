import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tasks', (table) => {
    table.string('telegram_chat_id', 32).nullable();
    table.bigInteger('telegram_message_id').unsigned().nullable();
    table.text('telegram_message_text').nullable();
    table.unique(['telegram_chat_id', 'telegram_message_id'], 'tasks_telegram_message_unique');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tasks', (table) => {
    table.dropUnique(['telegram_chat_id', 'telegram_message_id'], 'tasks_telegram_message_unique');
    table.dropColumn('telegram_chat_id');
    table.dropColumn('telegram_message_id');
    table.dropColumn('telegram_message_text');
  });
}
