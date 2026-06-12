/**
 * Communication delivery states, mirrors the Prisma `CommStatus` enum.
 * The ordering here IS the state machine: a communication may only advance to a
 * higher-ranked state. Late/out-of-order receipts for a lower state are ignored
 * (recorded in the event log, but they don't downgrade the projected status).
 */
export type CommStatus =
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'OPENED'
  | 'READ'
  | 'CLICKED'
  | 'FAILED';

/** Monotonic rank for the happy-path funnel. */
const RANK: Record<CommStatus, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  OPENED: 3,
  READ: 4,
  CLICKED: 5,
  FAILED: 99, // terminal; see shouldAdvance
};

/** Map an inbound event type to the status it would project to (or null if none). */
export function statusForEvent(
  type: string,
): CommStatus | null {
  switch (type) {
    case 'sent':
      return 'SENT';
    case 'delivered':
      return 'DELIVERED';
    case 'opened':
      return 'OPENED';
    case 'read':
      return 'READ';
    case 'clicked':
      return 'CLICKED';
    case 'failed':
      return 'FAILED';
    default:
      return null; // e.g. 'converted' — tracked via attribution, not status
  }
}

/**
 * Decide whether `next` should replace `current`.
 * - FAILED is terminal: once failed, nothing advances it; and FAILED only
 *   applies if the comm hasn't already progressed past SENT (a delivered/read
 *   message can't retroactively "fail").
 * - Otherwise advance only to a strictly higher rank (idempotent + order-safe).
 */
export function shouldAdvance(current: CommStatus, next: CommStatus): boolean {
  if (current === 'FAILED') return false;
  if (next === 'FAILED') return RANK[current] <= RANK['SENT'];
  return RANK[next] > RANK[current];
}
