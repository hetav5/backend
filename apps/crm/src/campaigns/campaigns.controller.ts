import { Controller, Get, Param, Post } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list() {
    return this.campaigns.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.campaigns.get(id);
  }

  /** Human approval action — the only path that actually sends. */
  @Post(':id/launch')
  launch(@Param('id') id: string) {
    return this.campaigns.launch(id);
  }

  @Get(':id/analytics')
  analytics(@Param('id') id: string) {
    return this.campaigns.analytics(id);
  }
}
