import { shouldAdvance, statusForEvent, CommStatus } from './state-rank';

describe('communication state machine', () => {
  it('maps event types to projected statuses', () => {
    expect(statusForEvent('sent')).toBe('SENT');
    expect(statusForEvent('clicked')).toBe('CLICKED');
    expect(statusForEvent('failed')).toBe('FAILED');
    expect(statusForEvent('converted')).toBeNull(); // tracked via attribution
    expect(statusForEvent('bogus')).toBeNull();
  });

  it('advances forward along the funnel', () => {
    expect(shouldAdvance('QUEUED', 'SENT')).toBe(true);
    expect(shouldAdvance('SENT', 'DELIVERED')).toBe(true);
    expect(shouldAdvance('DELIVERED', 'READ')).toBe(true);
  });

  it('is order-safe: a late lower-ranked event does not downgrade', () => {
    // READ already applied; a delayed DELIVERED arrives out of order.
    expect(shouldAdvance('READ', 'DELIVERED')).toBe(false);
    expect(shouldAdvance('CLICKED', 'OPENED')).toBe(false);
  });

  it('is idempotent: re-applying the same status is a no-op', () => {
    const states: CommStatus[] = ['SENT', 'DELIVERED', 'OPENED', 'READ', 'CLICKED'];
    for (const s of states) expect(shouldAdvance(s, s)).toBe(false);
  });

  it('FAILED is terminal and only applies before/at SENT', () => {
    expect(shouldAdvance('QUEUED', 'FAILED')).toBe(true);
    expect(shouldAdvance('SENT', 'FAILED')).toBe(true);
    // already engaged — cannot retroactively fail
    expect(shouldAdvance('DELIVERED', 'FAILED')).toBe(false);
    expect(shouldAdvance('READ', 'FAILED')).toBe(false);
    // nothing escapes FAILED
    expect(shouldAdvance('FAILED', 'DELIVERED')).toBe(false);
    expect(shouldAdvance('FAILED', 'CLICKED')).toBe(false);
  });
});
