import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TelegramApiService } from './telegram-api.service';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramSettingsService } from './telegram-settings.service';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TelegramApiService, TelegramSettingsService, TelegramBotService]
})
export class TasksModule {}
