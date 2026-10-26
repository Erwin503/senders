import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { TasksModule } from './tasks/tasks.module';
import { TemplatesModule } from './templates/templates.module';
import { RoutesModule } from './routes/routes.module';

@Module({
  imports: [DatabaseModule, AuthModule, TasksModule, TemplatesModule, RoutesModule]
})
export class AppModule {}
