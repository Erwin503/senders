import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    "ALTER TABLE columns MODIFY order_type ENUM('income', 'expense', 'store') NOT NULL DEFAULT 'expense'"
  );
  await knex.raw(
    "ALTER TABLE tasks MODIFY order_type ENUM('income', 'expense', 'store') NOT NULL DEFAULT 'expense'"
  );
  await knex.schema.alterTable('tasks', (table) => {
    table.string('telegram_source_chat_id', 32).nullable();
    table.bigInteger('telegram_source_message_id').unsigned().nullable();
  });

  await knex('columns').insert([
    { title: 'создан', slug: 'created', order_type: 'store', position: 7 },
    { title: 'собран', slug: 'assembled', order_type: 'store', position: 8 },
    { title: 'готов', slug: 'ready', order_type: 'store', position: 9 }
  ]);

  await knex.raw(
    'UPDATE tasks SET telegram_source_chat_id = telegram_chat_id, telegram_source_message_id = telegram_message_id WHERE telegram_message_id IS NOT NULL AND telegram_message_sent_by_bot = false'
  );
}

export async function down(knex: Knex): Promise<void> {
  const storeTaskCount = await knex('tasks').where({ order_type: 'store' }).count<{ count: number }[]>({ count: '*' });
  if (Number(storeTaskCount[0]?.count ?? 0) > 0) {
    throw new Error('Cannot revert store-order schema while store orders exist.');
  }

  await knex('columns').where({ order_type: 'store' }).delete();
  await knex.schema.alterTable('tasks', (table) => {
    table.dropColumn('telegram_source_chat_id');
    table.dropColumn('telegram_source_message_id');
  });
  await knex.raw("ALTER TABLE tasks MODIFY order_type ENUM('income', 'expense') NOT NULL DEFAULT 'expense'");
  await knex.raw("ALTER TABLE columns MODIFY order_type ENUM('income', 'expense') NOT NULL DEFAULT 'expense'");
}
