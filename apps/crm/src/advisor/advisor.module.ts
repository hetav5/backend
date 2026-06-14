import { Module } from '@nestjs/common';
import { LlmModule } from '../agent/llm.module';
import { AdvisorService } from './advisor.service';
import { AdvisorController } from './advisor.controller';

@Module({
  imports: [LlmModule],
  providers: [AdvisorService],
  controllers: [AdvisorController],
})
export class AdvisorModule {}
