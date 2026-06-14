import { Controller, Get } from '@nestjs/common';
import { AdvisorService } from './advisor.service';

@Controller('advisor')
export class AdvisorController {
  constructor(private readonly advisor: AdvisorService) {}

  /** AI strategy briefing (on-demand — costs one LLM call). */
  @Get('briefing')
  briefing() {
    return this.advisor.briefing();
  }
}
