import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('route_clients', (table) => {
    table.string('order_type', 80).nullable();
  });
  await knex.schema.alterTable('tasks', (table) => {
    table.timestamp('stocked_at').nullable();
  });
  await knex('tasks')
    .join('columns', 'tasks.column_id', 'columns.id')
    .where('columns.slug', 'stocked')
    .update({ stocked_at: knex.ref('tasks.updated_at') });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tasks', (table) => table.dropColumn('stocked_at'));
  await knex.schema.alterTable('route_clients', (table) => table.dropColumn('order_type'));
}
