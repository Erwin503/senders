import type { Knex } from 'knex';

const stages = [
  { title: '\u0441\u043e\u0437\u0434\u0430\u043d', slug: 'created', position: 0 },
  { title: '\u0441\u043e\u0431\u0440\u0430\u043d', slug: 'assembled', position: 1 },
  { title: '\u043e\u0442\u0433\u0440\u0443\u0436\u0435\u043d', slug: 'shipped', position: 2 },
  { title: '\u0433\u043e\u0442\u043e\u0432', slug: 'ready', position: 3 }
];

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    "ALTER TABLE columns MODIFY slug ENUM('todo', 'doing', 'done', 'created', 'assembled', 'shipped', 'ready', 'custom') NOT NULL DEFAULT 'custom'"
  );

  for (const stage of stages) {
    const existing = await knex('columns').where({ position: stage.position }).first();
    if (existing) {
      await knex('columns').where({ id: existing.id }).update({ title: stage.title, slug: stage.slug });
    } else {
      await knex('columns').insert(stage);
    }
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
