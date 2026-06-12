import { Controller, Get, Param, Query } from '@nestjs/common';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.customers.list(cursor, Number(limit ?? 25));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.customers.get(id);
  }
}
