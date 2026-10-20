import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    "ALTER TABLE columns MODIFY slug ENUM('created', 'assembled', 'shipped', 'ready', 'picked_up', 'stocked', 'custom') NOT NULL DEFAULT 'custom'"
  );
  await knex.schema.alterTable('columns', (table) => {
    table.enum('order_type', ['income', 'expense']).notNullable().defaultTo('expense');
  });
  await knex.schema.alterTable('tasks', (table) => {
    table.enum('order_type', ['income', 'expense']).notNullable().defaultTo('expense');
  });

  await knex('columns').insert([
    { title: 'создан', slug: 'created', order_type: 'income', position: 4 },
    { title: 'забрали', slug: 'picked_up', order_type: 'income', position: 5 },
    { title: 'оприходовали', slug: 'stocked', order_type: 'income', position: 6 }
  ]);
}

export async function down(knex: Knex): Promise<void> {
  const incomeTaskCount = await knex('tasks').where({ order_type: 'income' }).count<{ count: number }[]>({ count: '*' });
  if (Number(incomeTaskCount[0]?.count ?? 0) > 0) {
    throw new Error('Cannot revert income-order schema while income orders exist.');
  }

  await knex('columns').where({ order_type: 'income' }).delete();
  await knex.schema.alterTable('tasks', (table) => table.dropColumn('order_type'));
  await knex.schema.alterTable('columns', (table) => table.dropColumn('order_type'));
  await knex.raw(
    "ALTER TABLE columns MODIFY slug ENUM('created', 'assembled', 'shipped', 'ready', 'custom') NOT NULL DEFAULT 'custom'"
  );
}
