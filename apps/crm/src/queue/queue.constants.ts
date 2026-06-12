export const SEND_QUEUE = 'send';
export const RECEIPT_QUEUE = 'receipt';

export interface SendJobData {
  communicationId: string;
}

export interface ReceiptJobData {
  eventId: string;
  communicationId: string;
  type: string;
  occurredAt: string;
  raw?: Record<string, unknown>;
}
