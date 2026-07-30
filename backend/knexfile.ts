import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import type { Knex } from 'knex';

for (const envPath of [
  resolve(process.cwd(), '../.env'),
  resolve(__dirname, '../.env'),
  resolve(__dirname, '../../.env')
]) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath });
    break;
  }
}

const config: Knex.Config = {
  client: 'mysql2',
  connection: {
    host: process.env.MYSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? 'kanban',
    password: process.env.MYSQL_PASSWORD ?? 'kanban',
    database: process.env.MYSQL_DATABASE ?? 'tg_kanban'
  },
  migrations: {
    directory: './migrations',
    extension: 'ts'
  }
};

export default config;