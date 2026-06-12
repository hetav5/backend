import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SegmentsModule } from '../segments/segments.module';
import { CommsService } from './comms.service';
import { SendProcessor } from './send.processor';
import { ReceiptProcessor } from './receipt.processor';
import { SEND_QUEUE, RECEIPT_QUEUE } from '../queue/queue.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: SEND_QUEUE }, { name: RECEIPT_QUEUE }),
    SegmentsModule,
  ],
  providers: [CommsService, SendProcessor, ReceiptProcessor],
  exports: [CommsService],
})
export class CommsModule {}
