import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  CommunicationEventType,
  DispatchRequest,
  ReceiptEvent,
  signBody,
  normalizeBaseUrl,
} from '@shared';

interface PlannedEvent {
  type: CommunicationEventType;
  delayMs: number; // when (after dispatch) the event fires
  raw?: Record<string, unknown>;
}

/**
 * Simulates a messaging provider. For each dispatch it plans a realistic
 * lifecycle, then fires callbacks into the CRM /receipts endpoint — deliberately
 * injecting duplicate and out-of-order deliveries so the CRM's idempotency and
 * state-machine handling are exercised.
 */
@Injectable()
export class SimulatorService {
  private readonly logger = new Logger(SimulatorService.name);
  private readonly crmBase: string;
  private readonly secret: string;
  private readonly failureRate: number;
  private readonly conversionRate: number;

  constructor(private readonly config: ConfigService) {
    this.crmBase = normalizeBaseUrl(
      this.config.get<string>('CRM_BASE_URL', 'http://localhost:3001'),
    );
    this.secret = this.config.get<string>('RECEIPT_HMAC_SECRET', '');
    this.failureRate = Number(this.config.get<string>('CHANNEL_FAILURE_RATE', '0.08'));
    this.conversionRate = Number(this.config.get<string>('CHANNEL_CONVERSION_RATE', '0.15'));
  }

  schedule(req: DispatchRequest): string {
    const providerRef = randomUUID();
    const plan = this.plan();

    for (const ev of plan) {
      setTimeout(() => {
        void this.fire(req.communicationId, ev.type, ev.raw);
        // ~10% of the time, also deliver a duplicate of the same event a beat
        // later (same eventId is generated per fire, so duplicate => new id;
        // we force a true duplicate below for delivered/read).
      }, ev.delayMs);
    }
    return providerRef;
  }

  /** Build the lifecycle plan with drop-off, failure, out-of-order and dup. */
  private plan(): PlannedEvent[] {
    const events: PlannedEvent[] = [];
    let t = rand(200, 800);

    // Always "sent".
    events.push({ type: 'sent', delayMs: t });

    if (Math.random() < this.failureRate) {
      // Hard failure after the attempt.
      events.push({ type: 'failed', delayMs: t + rand(300, 1200) });
      return events;
    }

    // Delivered (almost always).
    t += rand(400, 1500);
    if (Math.random() < 0.97) {
      events.push({ type: 'delivered', delayMs: t });
    } else {
      return events; // never delivered
    }

    // Opened.
    t += rand(800, 4000);
    if (Math.random() < 0.6) {
      events.push({ type: 'opened', delayMs: t });
    } else {
      return events;
    }

    // Read.
    t += rand(500, 2500);
    if (Math.random() < 0.8) {
      events.push({ type: 'read', delayMs: t });
    } else {
      return events;
    }

    // Clicked.
    t += rand(800, 4000);
    if (Math.random() < 0.45) {
      events.push({ type: 'clicked', delayMs: t });
    } else {
      return events;
    }

    // Converted (order placed because of this comm).
    if (Math.random() < this.conversionRate) {
      t += rand(1000, 6000);
      events.push({
        type: 'converted',
        delayMs: t,
        raw: { amount: Number((rand(450, 3200) / 1).toFixed(0)) },
      });
    }

    // Inject out-of-order delivery: with some chance, nudge two adjacent
    // engagement events to fire in swapped order by tweaking their delays.
    if (events.length >= 4 && Math.random() < 0.25) {
      const i = 2; // opened/read region
      const tmp = events[i].delayMs;
      events[i].delayMs = events[i + 1]?.delayMs ?? tmp;
      if (events[i + 1]) events[i + 1].delayMs = tmp;
    }

    return events;
  }

  /** Fire one receipt callback. ~12% chance to send it twice (true duplicate). */
  private async fire(
    communicationId: string,
    type: CommunicationEventType,
    raw?: Record<string, unknown>,
  ): Promise<void> {
    const event: ReceiptEvent = {
      eventId: randomUUID(),
      communicationId,
      type,
      occurredAt: new Date().toISOString(),
      raw,
    };
    await this.post(event);

    if (Math.random() < 0.12) {
      // Duplicate the exact same event (same eventId) — CRM must dedupe.
      setTimeout(() => void this.post(event), rand(100, 500));
    }
  }

  private async post(event: ReceiptEvent): Promise<void> {
    const body = JSON.stringify(event);
    const signature = signBody(body, this.secret);
    try {
      const res = await fetch(`${this.crmBase}/receipts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-signature': signature },
        body,
      });
      if (!res.ok) {
        this.logger.warn(`Receipt POST ${event.type} -> ${res.status}`);
      }
    } catch (e: unknown) {
      this.logger.warn(`Receipt POST failed: ${(e as Error).message}`);
    }
  }
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
