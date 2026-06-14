import { Body, Controller, Post } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { BulkOrdersDto, CreateOrderDto } from './dto/create-order.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() body: CreateOrderDto) {
    return this.orders.create(body);
  }

  @Post('bulk')
  bulk(@Body() body: BulkOrdersDto) {
    return this.orders.createMany(body.orders);
  }
}
