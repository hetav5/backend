/** Channels supported by the (stubbed) provider. Mirrors the Prisma `Channel` enum. */
export type Channel = 'WHATSAPP' | 'SMS' | 'EMAIL' | 'RCS';
export const CHANNELS: Channel[] = ['WHATSAPP', 'SMS', 'EMAIL', 'RCS'];

/**
 * Lifecycle event types the channel service emits back to the CRM.
 * `converted` is a synthetic "an order happened because of this comm" signal.
 */
export type CommunicationEventType =
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'read'
  | 'clicked'
  | 'failed'
  | 'converted';

/** Payload the CRM sends to the channel service to dispatch one communication. */
export interface DispatchRequest {
  communicationId: string;
  recipient: string; // email or phone, depending on channel
  channel: Channel;
  message: string;
}

/**
 * Receipt callback payload: the channel service POSTs one of these to the CRM
 * `/receipts` endpoint for every lifecycle event. `eventId` is globally unique
 * and is the idempotency key on the CRM side.
 */
export interface ReceiptEvent {
  eventId: string;
  communicationId: string;
  type: CommunicationEventType;
  occurredAt: string; // ISO timestamp of when the event "happened" at the provider
  raw?: Record<string, unknown>;
}
