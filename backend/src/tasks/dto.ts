import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateTaskDto {
  @IsOptional()
  @IsIn(['income', 'expense'])
  orderType?: 'income' | 'expense';

  @IsString()
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  columnId?: number;
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class MoveTaskDto {
  @IsInt()
  @Min(1)
  columnId!: number;

  @IsInt()
  @Min(0)
  position!: number;
}

export class CreateColumnDto {
  @IsString()
  @MaxLength(80)
  title!: string;
}

export class UpdateColumnDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @IsIn(['created', 'assembled', 'shipped', 'ready', 'picked_up', 'stocked', 'custom'])
  slug?: string;
}
