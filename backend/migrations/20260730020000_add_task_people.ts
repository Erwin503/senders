import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tasks', (table) => {
    table.string('responsible_id', 32).nullable();
    table.string('responsible_name', 160).nullable();
    table.string('storekeeper_id', 32).nullable();
    table.string('storekeeper_name', 160).nullable();
    table.string('driver_id', 32).nullable();
    table.string('driver_name', 160).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tasks', (table) => {
    table.dropColumn('responsible_id');
    table.dropColumn('responsible_name');
    table.dropColumn('storekeeper_id');
    table.dropColumn('storekeeper_name');
    table.dropColumn('driver_id');
    table.dropColumn('driver_name');
  });
}