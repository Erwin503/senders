import type { Knex } from 'knex';

const stages = [
  { title: 'создан', slug: 'created', position: 0 },
  { title: 'собран', slug: 'assembled', position: 1 },
  { title: 'отгружен', slug: 'shipped', position: 2 },
  { title: 'готов', slug: 'ready', position: 3 }
];

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    "ALTER TABLE columns MODIFY slug ENUM('todo', 'doing', 'done', 'created', 'assembled', 'shipped', 'ready', 'custom') NOT NULL DEFAULT 'custom'"
  );

  for (const stage of stages) {
    const existingByPosition = await knex('columns').where({ position: stage.position }).first();
    if (existingByPosition) {
      await knex('columns').where({ id: existingByPosition.id }).update({ title: stage.title, slug: stage.slug });
      continue;
    }

    const existingBySlug = await knex('columns').where({ slug: stage.slug }).first();
    if (existingBySlug) {
      await knex('columns').where({ id: existingBySlug.id }).update({ title: stage.title, position: stage.position });
      continue;
    }

    await knex('columns').insert(stage);
  }

  await knex.raw(
    "ALTER TABLE columns MODIFY slug ENUM('created', 'assembled', 'shipped', 'ready', 'custom') NOT NULL DEFAULT 'custom'"
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    "ALTER TABLE columns MODIFY slug ENUM('todo', 'doing', 'done', 'created', 'assembled', 'shipped', 'ready', 'custom') NOT NULL DEFAULT 'custom'"
  );
  await knex('columns').where({ slug: 'ready' }).delete();
  await knex('columns').where({ slug: 'created' }).update({ title: 'To do', slug: 'todo', position: 0 });
  await knex('columns').where({ slug: 'assembled' }).update({ title: 'Doing', slug: 'doing', position: 1 });
  await knex('columns').where({ slug: 'shipped' }).update({ title: 'Done', slug: 'done', position: 2 });
  await knex.raw("ALTER TABLE columns MODIFY slug ENUM('todo', 'doing', 'done', 'custom') NOT NULL DEFAULT 'custom'");
}