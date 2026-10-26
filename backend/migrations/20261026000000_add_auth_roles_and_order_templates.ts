import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('username', 80).notNullable().unique();
    table.string('display_name', 160).notNullable();
    table.string('password_hash', 255).notNullable();
    table.enum('role', ['admin', 'manager', 'driver', 'storekeeper']).notNullable();
    table.timestamps(true, true);
  });

  await knex.schema.createTable('sessions', (table) => {
    table.string('token_hash', 64).primary();
    table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.dateTime('expires_at').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['user_id', 'expires_at']);
  });

  await knex.schema.createTable('order_templates', (table) => {
    table.increments('id').primary();
    table.integer('owner_admin_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('created_by_user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.enum('order_type', ['income', 'expense', 'store']).notNullable();
    table.string('address', 160).notNullable();
    table.text('description').nullable();
    table.dateTime('active_at').nullable();
    table.timestamps(true, true);
    table.index(['owner_admin_id', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('order_templates');
  await knex.schema.dropTableIfExists('sessions');
  await knex.schema.dropTableIfExists('users');
}
