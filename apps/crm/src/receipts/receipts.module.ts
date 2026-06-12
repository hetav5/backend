import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReceiptsController } from './receipts.controller';
import { RECEIPT_QUEUE } from '../queue/queue.constants';

@Module({
  imports: [BullModule.registerQueue({ name: RECEIPT_QUEUE })],
  controllers: [ReceiptsController],
})
export class ReceiptsModule {}
