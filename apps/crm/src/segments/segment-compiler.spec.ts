import { SegmentCompiler } from './segment-compiler';
import { Rule } from '@shared';

describe('SegmentCompiler', () => {
  it('compiles a single numeric leaf with a bound param', () => {
    const rule: Rule = { field: 'lastOrderDaysAgo', op: '>', value: 60 };
    const { sql, params } = SegmentCompiler.compile(rule);
    expect(sql).toContain('MAX(o."placedAt")');
    expect(sql).toContain('> $1');
    expect(params).toEqual([60]);
  });

  it('compiles AND groups with OR nesting and ordered params', () => {
    const rule: Rule = {
      all: [
        { field: 'lastOrderDaysAgo', op: '>', value: 60 },
        { any: [
          { field: 'orderCount', op: '>=', value: 5 },
          { field: 'lifetimeValue', op: '>=', value: 10000 },
        ] },
      ],
    };
    const { sql, params } = SegmentCompiler.compile(rule);
    expect(sql).toContain(' AND ');
    expect(sql).toContain(' OR ');
    expect(params).toEqual([60, 5, 10000]);
  });

  it('compiles a jsonb attribute equality (key + value both bound)', () => {
    const rule: Rule = { field: 'attributes.city', op: '=', value: 'Mumbai' };
    const { sql, params } = SegmentCompiler.compile(rule);
    expect(sql).toContain('c.attributes ->>');
    expect(params).toEqual(['city', 'Mumbai']);
  });

  it('compiles an IN list with ANY()', () => {
    const rule: Rule = { field: 'attributes.city', op: 'in', value: ['Mumbai', 'Pune'] };
    const { sql, params } = SegmentCompiler.compile(rule);
    expect(sql).toContain('= ANY(');
    expect(params).toEqual(['city', ['Mumbai', 'Pune']]);
  });

  it('matches everyone when the rule is empty', () => {
    expect(SegmentCompiler.compile(undefined).sql).toBe('TRUE');
  });
});
