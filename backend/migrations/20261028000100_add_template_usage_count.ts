import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('order_templates', (table) => {
    table.integer('usage_count').unsigned().notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('order_templates', (table) => table.dropColumn('usage_count'));
}
