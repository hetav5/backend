import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { DispatchRequest } from '@shared';
import { SimulatorService } from './simulator.service';

/**
 * The stubbed provider's send API. Accepts a dispatch, acknowledges immediately
 * with 202, then asynchronously simulates the delivery/engagement lifecycle and
 * calls back into the CRM's /receipts endpoint.
 */
@Controller('dispatch')
export class DispatchController {
  constructor(private readonly simulator: SimulatorService) {}

  @Post()
  @HttpCode(202)
  dispatch(@Body() req: DispatchRequest): { accepted: true; providerRef: string } {
    const providerRef = this.simulator.schedule(req);
    return { accepted: true, providerRef };
  }
}
