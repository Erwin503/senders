import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('route_districts', (table) => {
    table.increments('id').primary();
    table.string('name', 80).notNullable();
    table.string('name_key', 320).notNullable().unique();
    table.integer('position').unsigned().notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('route_clients', (table) => {
    table.increments('id').primary();
    table.string('name', 160).notNullable();
    table.string('name_key', 640).notNullable().unique();
    table.integer('district_id').unsigned().nullable().references('id').inTable('route_districts').onDelete('SET NULL');
    table.string('circle_type', 80).nullable();
    table.integer('position').unsigned().notNullable();
    table.timestamps(true, true);
    table.index(['district_id', 'position']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('route_clients');
  await knex.schema.dropTableIfExists('route_districts');
}
