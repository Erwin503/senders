import { Global, Module } from '@nestjs/common';
import knex from 'knex';
import knexConfig from '../../knexfile';

export const KNEX = Symbol('KNEX');

@Global()
@Module({
  providers: [
    {
      provide: KNEX,
      useFactory: () => knex(knexConfig)
    }
  ],
  exports: [KNEX]
})
export class DatabaseModule {}
