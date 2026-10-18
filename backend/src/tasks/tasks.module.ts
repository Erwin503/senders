import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TelegramApiService } from './telegram-api.service';
import { TelegramBotService } from './telegram-bot.service';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TelegramApiService, TelegramBotService]
})
export class TasksModule {}
