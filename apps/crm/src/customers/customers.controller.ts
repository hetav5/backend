import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { BulkCustomersDto, CreateCustomerDto } from './dto/create-customer.dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.customers.list(cursor, Number(limit ?? 25));
  }

  @Post()
  create(@Body() body: CreateCustomerDto) {
    return this.customers.create(body);
  }

  @Post('bulk')
  bulk(@Body() body: BulkCustomersDto) {
    return this.customers.createMany(body.customers);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.customers.get(id);
  }
}
