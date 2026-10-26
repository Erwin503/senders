import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { AuthOrIntegrationGuard } from '../auth/auth-or-integration.guard';
import { CreateColumnDto, CreateTaskDto, MoveTaskByExternalNumberDto, MoveTaskDto, UpdateColumnDto, UpdateTaskDto } from './dto';
import { TasksService } from './tasks.service';

@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('board')
  @UseGuards(AuthGuard)
  getBoard(@Req() request: AuthenticatedRequest) {
    return this.tasks.getBoard(request.user);
  }

  @Post('columns')
  @UseGuards(AuthGuard)
  createColumn(@Body() dto: CreateColumnDto) {
    return this.tasks.createColumn(dto);
  }

  @Patch('columns/:id')
  @UseGuards(AuthGuard)
  updateColumn(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateColumnDto) {
    return this.tasks.updateColumn(id, dto);
  }

  @Post('tasks')
  @UseGuards(AuthOrIntegrationGuard)
  createTask(@Body() dto: CreateTaskDto, @Req() request: AuthenticatedRequest) {
    return this.tasks.createTask(dto, this.siteUser(request));
  }

  @Patch('tasks/:id')
  @UseGuards(AuthGuard)
  updateTask(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTaskDto) {
    return this.tasks.updateTask(id, dto);
  }

  @Patch('tasks/:id/move')
  @UseGuards(AuthGuard)
  moveTask(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveTaskDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.tasks.moveTask(id, dto, this.siteUser(request));
  }

  @Patch('tasks/move-by-external-number')
  @UseGuards(AuthOrIntegrationGuard)
  moveTaskByExternalNumber(
    @Body() dto: MoveTaskByExternalNumberDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.tasks.moveTaskByExternalNumber(dto.externalNumber, dto, this.siteUser(request));
  }

  @Delete('tasks/:id')
  @UseGuards(AuthGuard)
  deleteTask(@Param('id', ParseIntPipe) id: number) {
    return this.tasks.deleteTask(id);
  }

  private siteUser(request: AuthenticatedRequest) {
    return { id: String(request.user.id), name: request.user.name };
  }
}
