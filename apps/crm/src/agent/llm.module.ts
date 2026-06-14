import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';

/** Shared LLM provider so the agent and analysis features use one instance. */
@Module({
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
