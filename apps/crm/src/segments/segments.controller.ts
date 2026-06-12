import { Body, Controller, Post } from '@nestjs/common';
import { Rule } from '@shared';
import { SegmentsService } from './segments.service';

@Controller('segments')
export class SegmentsController {
  constructor(private readonly segments: SegmentsService) {}

  /** Preview an audience from a rule tree: { count, sample }. */
  @Post('preview')
  preview(@Body() body: { definition: Rule }) {
    return this.segments.preview(body?.definition);
  }
}
