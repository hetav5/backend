import { Module } from '@nestjs/common';
import { SegmentsModule } from '../segments/segments.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { LlmService } from './llm.service';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';

@Module({
  imports: [SegmentsModule, CampaignsModule],
  providers: [LlmService, AgentService],
  controllers: [AgentController],
})
export class AgentModule {}
