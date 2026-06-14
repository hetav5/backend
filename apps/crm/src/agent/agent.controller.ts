import { Body, Controller, Get, Logger, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { AgentService } from './agent.service';

interface ChatBody {
  conversationId?: string;
  message: string;
}

/** Translate raw provider errors into a short, user-facing message. */
function friendlyError(e: unknown): string {
  const raw = (e as Error)?.message ?? '';
  const status = (e as { status?: number })?.status;
  if (status === 429 || /\b429\b|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(raw)) {
    const m = raw.match(/retry(?:Delay)?["']?\s*[:=]?\s*["']?(\d+)\s*s/i);
    const when = m ? `about ${m[1]}s` : 'a little while';
    return `The AI is rate-limited right now (free-tier quota reached). Please try again in ${when}.`;
  }
  if (status === 503 || /\b503\b|UNAVAILABLE|overloaded/i.test(raw)) {
    return 'The AI is temporarily overloaded. Please try again in a moment.';
  }
  if (status === 401 || status === 403 || /API key|permission denied/i.test(raw)) {
    return 'The AI service rejected the request — check the API key configuration.';
  }
  return 'Something went wrong while generating a response. Please try again.';
}

@Controller('agent')
export class AgentController {
  private readonly logger = new Logger(AgentController.name);

  constructor(private readonly agent: AgentService) {}

  /** SSE stream: token / tool_result / message_done / error events. */
  @Post('stream')
  async stream(@Body() body: ChatBody, @Res() res: Response): Promise<void> {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      await this.agent.run(body.conversationId, body.message, send);
    } catch (e: unknown) {
      this.logger.error(`Agent stream failed: ${(e as Error)?.message}`);
      send('error', { message: friendlyError(e) });
    } finally {
      res.end();
    }
  }

  @Get('conversations/:id')
  conversation(@Param('id') id: string) {
    return this.agent.getConversation(id);
  }
}
