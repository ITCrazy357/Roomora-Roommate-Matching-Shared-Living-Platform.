import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(/[A-Za-zÀ-ỹ]/u, { message: 'Mật khẩu cần có ít nhất một chữ cái' })
  @Matches(/[0-9]/, { message: 'Mật khẩu cần có ít nhất một chữ số' })
  password!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(2, 80)
  displayName!: string;
}

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}

export class EmailDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class TokenDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{40,128}$/)
  token!: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(/[A-Za-zÀ-ỹ]/u, { message: 'Mật khẩu cần có ít nhất một chữ cái' })
  @Matches(/[0-9]/, { message: 'Mật khẩu cần có ít nhất một chữ số' })
  newPassword!: string;
}
