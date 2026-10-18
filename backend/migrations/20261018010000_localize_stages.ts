import type { Knex } from 'knex';

const titles: Record<string, string> = {
  created: '\u0441\u043e\u0437\u0434\u0430\u043d',
  assembled: '\u0441\u043e\u0431\u0440\u0430\u043d',
  shipped: '\u043e\u0442\u0433\u0440\u0443\u0436\u0435\u043d',
  ready: '\u0433\u043e\u0442\u043e\u0432'
};

export async function up(knex: Knex): Promise<void> {
  for (const [slug, title] of Object.entries(titles)) {
    await knex('columns').where({ slug }).update({ title });
  }
}

export async function down(): Promise<void> {}
