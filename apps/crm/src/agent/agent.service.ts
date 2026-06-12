import { Injectable, Logger } from '@nestjs/common';
import { Content, Part } from '@google/genai';
import { PrismaService } from '../prisma/prisma.service';
import { SegmentsService } from '../segments/segments.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { LlmService } from './llm.service';
import { TOOL_DECLARATIONS, SYSTEM_INSTRUCTION } from './agent.tools';
import { Rule } from '@shared';

export type Emit = (event: string, data: unknown) => void;

const MAX_TURNS = 8;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: SegmentsService,
    private readonly campaigns: CampaignsService,
    private readonly llm: LlmService,
  ) {}

  async getConversation(id: string) {
    return this.prisma.agentConversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  /**
   * Run one user turn: stream tokens, drive the function-call loop, persist the
   * full transcript, and emit SSE events (token / tool_result / message_done).
   */
  async run(
    conversationId: string | undefined,
    message: string,
    emit: Emit,
  ): Promise<void> {
    const conv = conversationId
      ? await this.prisma.agentConversation.findUnique({ where: { id: conversationId } })
      : null;
    const conversation =
      conv ??
      (await this.prisma.agentConversation.create({
        data: { title: message.slice(0, 60) },
      }));

    const history = await this.prisma.agentMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
    });
    const contents: Content[] = history.map((m) => ({
      role: m.role,
      parts: m.parts as unknown as Part[],
    }));

    const userParts: Part[] = [{ text: message }];
    contents.push({ role: 'user', parts: userParts });
    await this.persist(conversation.id, 'user', userParts);

    let lastModelMessageId = '';
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const stream = await this.llm.streamTurn(
        contents,
        SYSTEM_INSTRUCTION,
        TOOL_DECLARATIONS,
      );

      let text = '';
      const calls: { name: string; args: Record<string, unknown> }[] = [];
      const seen = new Set<string>();

      for await (const chunk of stream) {
        if (chunk.text) {
          text += chunk.text;
          emit('token', { text: chunk.text });
        }
        for (const fc of chunk.functionCalls ?? []) {
          const key = `${fc.name}:${JSON.stringify(fc.args ?? {})}`;
          if (fc.name && !seen.has(key)) {
            seen.add(key);
            calls.push({ name: fc.name, args: (fc.args ?? {}) as Record<string, unknown> });
          }
        }
      }

      // Persist the model turn (text + any function calls), in order.
      const modelParts: Part[] = [];
      if (text) modelParts.push({ text });
      for (const c of calls) modelParts.push({ functionCall: { name: c.name, args: c.args } });
      if (modelParts.length) {
        contents.push({ role: 'model', parts: modelParts });
        const saved = await this.persist(conversation.id, 'model', modelParts);
        lastModelMessageId = saved.id;
      }

      if (calls.length === 0) break; // final text answer

      // Execute tools, emit cards, feed results back.
      const responseParts: Part[] = [];
      for (const call of calls) {
        const payload = await this.executeTool(call.name, call.args);
        emit('tool_result', { tool: call.name, payload });
        responseParts.push({
          functionResponse: { name: call.name, response: payload },
        });
      }
      contents.push({ role: 'user', parts: responseParts });
      await this.persist(conversation.id, 'user', responseParts);
    }

    emit('message_done', {
      conversationId: conversation.id,
      messageId: lastModelMessageId,
    });
  }

  private persist(conversationId: string, role: string, parts: Part[]) {
    return this.prisma.agentMessage.create({
      data: { conversationId, role, parts: parts as never },
    });
  }

  /** Dispatch a tool call to the right service. Returns the card payload. */
  private async executeTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      switch (name) {
        case 'preview_audience': {
          const r = await this.segments.preview(args.ruleTree as Rule);
          return { count: r.count, sample: r.sample };
        }
        case 'draft_message': {
          const message = String(args.message ?? '');
          return {
            channel: args.channel,
            message,
            tokens: this.extractTokens(message),
          };
        }
        case 'recommend_channel':
          return { channel: args.channel, rationale: args.rationale };
        case 'create_campaign': {
          return await this.campaigns.createDraft({
            name: String(args.name),
            ruleTree: args.ruleTree as Rule,
            channel: String(args.channel),
            message: String(args.message),
            goalText: args.goalText ? String(args.goalText) : undefined,
          });
        }
        case 'launch_campaign': {
          const c = await this.campaigns.get(String(args.campaignId));
          return {
            requiresApproval: true,
            campaignId: c.id,
            name: c.name,
            channel: c.channel,
            recipientCount: c.segmentCount,
            sampleMessage: c.message,
          };
        }
        case 'get_campaign_analytics':
          return await this.campaigns.analytics(String(args.campaignId));
        default:
          return { error: `Unknown tool: ${name}` };
      }
    } catch (e: unknown) {
      this.logger.error(`Tool ${name} failed: ${(e as Error).message}`);
      return { error: (e as Error).message };
    }
  }

  private extractTokens(message: string): string[] {
    const tokens = new Set<string>();
    const re = /\{\{\s*(\w+)\s*\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(message))) tokens.add(m[1]);
    return [...tokens];
  }
}
