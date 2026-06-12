import { Module } from '@nestjs/common';
import { SegmentsModule } from '../segments/segments.module';
import { CommsModule } from '../comms/comms.module';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';

@Module({
  imports: [SegmentsModule, CommsModule],
  providers: [CampaignsService],
  controllers: [CampaignsController],
  exports: [CampaignsService],
})
export class CampaignsModule {}
