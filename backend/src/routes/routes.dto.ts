import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class RouteImportEntryDto {
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  orderType?: string;
}

export class ImportRouteListDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteImportEntryDto)
  entries!: RouteImportEntryDto[];
}

export class CreateDistrictDto {
  @IsString()
  @MaxLength(80)
  name!: string;
}

export class UpdateRouteClientDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  districtId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  circleType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  orderType?: string | null;
}

export class ReorderDistrictsDto {
  @IsArray()
  @IsInt({ each: true })
  districtIds!: number[];
}

export class ReorderRouteClientsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  districtId?: number | null;

  @IsArray()
  @IsInt({ each: true })
  clientIds!: number[];
}
