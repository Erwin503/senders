import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CreateDistrictDto, ImportRouteListDto, ReorderDistrictsDto, ReorderRouteClientsDto, UpdateRouteClientDto } from './routes.dto';
import { RoutesService } from './routes.service';

@Controller('route')
@UseGuards(AuthGuard)
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @Post('import')
  importList(@Body() dto: ImportRouteListDto) {
    return this.routes.importList(dto);
  }

  @Get('clients')
  listClients() {
    return this.routes.list();
  }

  @Post('districts')
  createDistrict(@Body() dto: CreateDistrictDto) {
    return this.routes.createDistrict(dto);
  }

  @Patch('districts/reorder')
  reorderDistricts(@Body() dto: ReorderDistrictsDto) {
    return this.routes.reorderDistricts(dto);
  }

  @Patch('clients/reorder')
  reorderClients(@Body() dto: ReorderRouteClientsDto) {
    return this.routes.reorderClients(dto);
  }

  @Patch('clients/:id')
  updateClient(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRouteClientDto) {
    return this.routes.updateClient(id, dto);
  }
}
