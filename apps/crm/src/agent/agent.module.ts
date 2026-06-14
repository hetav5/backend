import { Module } from '@nestjs/common';
import { SegmentsModule } from '../segments/segments.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { LlmModule } from './llm.module';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';

@Module({
  imports: [SegmentsModule, CampaignsModule, LlmModule],
  providers: [AgentService],
  controllers: [AgentController],
})
export class AgentModule {}
