import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { AgentService } from './agent.service';

interface ChatBody {
  conversationId?: string;
  message: string;
}

@Controller('agent')
export class AgentController {
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
      send('error', { message: (e as Error).message });
    } finally {
      res.end();
    }
  }

  @Get('conversations/:id')
  conversation(@Param('id') id: string) {
    return this.agent.getConversation(id);
  }
}
