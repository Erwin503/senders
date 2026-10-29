import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex('route_clients')
    .whereNotNull('order_type')
    .update({ circle_type: knex.raw('COALESCE(circle_type, order_type)') });
  await knex.schema.alterTable('route_clients', (table) => table.dropColumn('order_type'));
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('route_clients', (table) => {
    table.string('order_type', 80).nullable();
  });
  await knex('route_clients')
    .whereNotNull('circle_type')
    .update({ order_type: knex.ref('circle_type') });
}
