import { Controller, Get, Param } from '@nestjs/common';
import { InsightsService } from './insights.service';

@Controller('campaigns')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  /** AI performance review for a campaign (on-demand — costs one LLM call). */
  @Get(':id/insights')
  forCampaign(@Param('id') id: string) {
    return this.insights.forCampaign(id);
  }
}
