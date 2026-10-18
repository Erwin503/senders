import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('columns', (table) => {
    table.increments('id').primary();
    table.string('title', 80).notNullable();
    table.enum('slug', ['created', 'assembled', 'shipped', 'ready', 'custom']).notNullable().defaultTo('custom');
    table.integer('position').unsigned().notNullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('tasks', (table) => {
    table.increments('id').primary();
    table.integer('column_id').unsigned().notNullable().references('id').inTable('columns').onDelete('CASCADE');
    table.string('title', 160).notNullable();
    table.text('description').nullable();
    table.integer('position').unsigned().notNullable();
    table.timestamps(true, true);
    table.index(['column_id', 'position']);
  });

  await knex('columns').insert([
    { title: '\u0441\u043e\u0437\u0434\u0430\u043d', slug: 'created', position: 0 },
    { title: '\u0441\u043e\u0431\u0440\u0430\u043d', slug: 'assembled', position: 1 },
    { title: '\u043e\u0442\u0433\u0440\u0443\u0436\u0435\u043d', slug: 'shipped', position: 2 },
    { title: '\u0433\u043e\u0442\u043e\u0432', slug: 'ready', position: 3 }
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tasks');
  await knex.schema.dropTableIfExists('columns');
}
