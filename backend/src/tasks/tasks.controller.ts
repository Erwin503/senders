import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req } from '@nestjs/common';
import type { RequestWithUser } from '../auth/telegram-user.type';
import { CreateColumnDto, CreateTaskDto, MoveTaskDto, UpdateColumnDto, UpdateTaskDto } from './dto';
import { TasksService } from './tasks.service';

@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('board')
  getBoard() {
    return this.tasks.getBoard();
  }

  @Post('columns')
  createColumn(@Body() dto: CreateColumnDto) {
    return this.tasks.createColumn(dto);
  }

  @Patch('columns/:id')
  updateColumn(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateColumnDto) {
    return this.tasks.updateColumn(id, dto);
  }

  @Post('tasks')
  createTask(@Body() dto: CreateTaskDto, @Req() request: RequestWithUser) {
    return this.tasks.createTask(dto, request.telegramUser);
  }

  @Patch('tasks/:id')
  updateTask(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTaskDto) {
    return this.tasks.updateTask(id, dto);
  }

  @Patch('tasks/:id/move')
  moveTask(@Param('id', ParseIntPipe) id: number, @Body() dto: MoveTaskDto, @Req() request: RequestWithUser) {
    return this.tasks.moveTask(id, dto, request.telegramUser);
  }

  @Delete('tasks/:id')
  deleteTask(@Param('id', ParseIntPipe) id: number) {
    return this.tasks.deleteTask(id);
  }
}