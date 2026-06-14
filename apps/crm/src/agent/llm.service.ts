import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenAI,
  Content,
  FunctionDeclaration,
  GenerateContentResponse,
} from '@google/genai';

/**
 * Thin wrapper around the Google GenAI SDK so the rest of the app depends on an
 * interface, not the provider. Swap this file to change LLMs.
 *
 * Gemini's free tier returns transient 503 (UNAVAILABLE) / 429 (RESOURCE_EXHAUSTED)
 * under load, so requests are retried with exponential backoff + jitter.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly ai: GoogleGenAI;
  private readonly model: string;
  private readonly maxAttempts = 5;
  private readonly baseDelayMs = 600;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    this.model = this.config.get<string>('GEMINI_MODEL', 'gemini-2.5-flash');
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * One-shot JSON completion (non-streaming). Forces application/json output
   * and returns the raw text for the caller to parse. Used for analysis tasks
   * like campaign performance reviews.
   */
  async completeJson(
    systemInstruction: string,
    prompt: string,
  ): Promise<string> {
    const res = await this.withRetry(() =>
      this.ai.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { systemInstruction, responseMimeType: 'application/json' },
      }),
    );
    return res.text ?? '';
  }

  /**
   * Stream one model turn. Retries the request (not mid-stream) on transient
   * overload/rate-limit errors before handing back the chunk iterator.
   */
  streamTurn(
    contents: Content[],
    systemInstruction: string,
    functionDeclarations: FunctionDeclaration[],
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this.withRetry(() =>
      this.ai.models.generateContentStream({
        model: this.model,
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations }],
        },
      }),
    );
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (e: unknown) {
        lastErr = e;
        if (!this.isRetryable(e) || attempt === this.maxAttempts - 1) throw e;
        const delay =
          this.baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 400);
        this.logger.warn(
          `Gemini transient error (attempt ${attempt + 1}/${this.maxAttempts}); retrying in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  /** 503 / 429 / overloaded / quota errors are worth retrying; 4xx auth/bad-request are not. */
  private isRetryable(e: unknown): boolean {
    const status = (e as { status?: number })?.status;
    if (status === 503 || status === 429 || status === 500) return true;
    const msg = (e as Error)?.message ?? '';
    return /\b(503|429|500)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|deadline|ECONNRESET|ETIMEDOUT/i.test(
      msg,
    );
  }
}
