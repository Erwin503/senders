import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tasks', (table) => {
    table.timestamp('ready_at').nullable();
  });

  await knex('tasks')
    .whereIn('column_id', knex('columns').select('id').where({ slug: 'ready' }))
    .update({ ready_at: knex.ref('updated_at') });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tasks', (table) => {
    table.dropColumn('ready_at');
  });
}
