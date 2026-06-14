import { Module } from '@nestjs/common';
import { CommsModule } from '../comms/comms.module';
import { SegmentsModule } from '../segments/segments.module';
import { LlmModule } from '../agent/llm.module';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';

@Module({
  imports: [CommsModule, SegmentsModule, LlmModule],
  providers: [InsightsService],
  controllers: [InsightsController],
})
export class InsightsModule {}
