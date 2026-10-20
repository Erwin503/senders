import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tasks', (table) => {
    table.string('external_number', 100).nullable().unique('tasks_external_number_unique');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tasks', (table) => {
    table.dropUnique(['external_number'], 'tasks_external_number_unique');
    table.dropColumn('external_number');
  });
}
