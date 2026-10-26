import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { TasksModule } from './tasks/tasks.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [DatabaseModule, AuthModule, TasksModule, TemplatesModule]
})
export class AppModule {}
