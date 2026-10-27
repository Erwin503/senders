import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTemplateDto {
  @IsIn(['income', 'expense', 'store'])
  orderType!: 'income' | 'expense' | 'store';

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsDateString()
  activeAt?: string | null;
}

export class UpdateTemplateDto extends CreateTemplateDto {}
