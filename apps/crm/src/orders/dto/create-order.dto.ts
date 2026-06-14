import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderItemDto {
  @IsString()
  sku!: string;

  @IsNumber()
  @Min(0)
  qty!: number;

  @IsNumber()
  @Min(0)
  price!: number;
}

export class CreateOrderDto {
  /** Reference the customer by id OR by email (one is required). */
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsNumber()
  @Min(0)
  total!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];

  /** ISO-8601 timestamp; defaults to now when omitted. */
  @IsOptional()
  @IsISO8601()
  placedAt?: string;
}

export class BulkOrdersDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderDto)
  orders!: CreateOrderDto[];
}
