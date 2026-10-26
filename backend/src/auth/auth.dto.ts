import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { UserRole } from './auth.types';

export class RegisterDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  username!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  displayName?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;
}

export class LoginDto {
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class UpdateRoleDto {
  @IsIn(['admin', 'manager', 'driver', 'storekeeper'])
  role!: UserRole;
}
