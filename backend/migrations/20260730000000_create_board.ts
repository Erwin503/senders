import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('columns', (table) => {
    table.increments('id').primary();
    table.string('title', 80).notNullable();
    table.enum('slug', ['created', 'assembled', 'shipped', 'ready', 'custom']).notNullable().defaultTo('custom');
    table.integer('position').unsigned().notNullable();
    table.string('responsible_id', 32).nullable();
    table.string('responsible_name', 160).nullable();
    table.string('storekeeper_id', 32).nullable();
    table.string('storekeeper_name', 160).nullable();
    table.string('driver_id', 32).nullable();
    table.string('driver_name', 160).nullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('tasks', (table) => {
    table.increments('id').primary();
    table.integer('column_id').unsigned().notNullable().references('id').inTable('columns').onDelete('CASCADE');
    table.string('title', 160).notNullable();
    table.text('description').nullable();
    table.integer('position').unsigned().notNullable();
    table.string('responsible_id', 32).nullable();
    table.string('responsible_name', 160).nullable();
    table.string('storekeeper_id', 32).nullable();
    table.string('storekeeper_name', 160).nullable();
    table.string('driver_id', 32).nullable();
    table.string('driver_name', 160).nullable();
    table.timestamps(true, true);
    table.index(['column_id', 'position']);
  });

  await knex('columns').insert([
    { title: 'создан', slug: 'created', position: 0 },
    { title: 'собран', slug: 'assembled', position: 1 },
    { title: 'отгружен', slug: 'shipped', position: 2 },
    { title: 'готов', slug: 'ready', position: 3 }
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tasks');
  await knex.schema.dropTableIfExists('columns');
}
