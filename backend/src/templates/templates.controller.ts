import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CreateTemplateDto, UpdateTemplateDto } from './templates.dto';
import { TemplatesService } from './templates.service';

@Controller('templates')
@UseGuards(AuthGuard)
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.templates.list(request.user);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateTemplateDto) {
    return this.templates.create(request.user, dto);
  }

  @Patch(':id')
  update(@Req() request: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(id, request.user, dto);
  }

  @Delete(':id')
  delete(@Req() request: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.templates.delete(id, request.user);
  }

  @Post(':id/use')
  recordUse(@Req() request: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.templates.recordUse(id, request.user);
  }
}
