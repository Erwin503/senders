import { Body, Controller, Delete, Get, Headers, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
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
  createTask(@Body() dto: CreateTaskDto, @Headers('x-user-name') userName?: string) {
    return this.tasks.createTask(dto, this.siteUser(userName));
  }

  @Patch('tasks/:id')
  updateTask(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTaskDto) {
    return this.tasks.updateTask(id, dto);
  }

  @Patch('tasks/:id/move')
  moveTask(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveTaskDto,
    @Headers('x-user-name') userName?: string
  ) {
    return this.tasks.moveTask(id, dto, this.siteUser(userName));
  }

  @Delete('tasks/:id')
  deleteTask(@Param('id', ParseIntPipe) id: number) {
    return this.tasks.deleteTask(id);
  }

  private siteUser(name?: string) {
    let decodedName = name;
    try {
      decodedName = name ? decodeURIComponent(name) : undefined;
    } catch {
      decodedName = name;
    }
    const cleanName = decodedName?.trim().slice(0, 160) || 'Оператор';
    return { id: `site:${cleanName.toLocaleLowerCase('ru-RU')}`, name: cleanName };
  }
}
