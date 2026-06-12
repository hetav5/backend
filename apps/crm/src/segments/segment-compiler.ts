import { Rule, LeafRule, isGroup } from '@shared';

/**
 * Compiles an audience Rule tree into a parameterized SQL `HAVING` fragment
 * evaluated against a per-customer aggregate query (see segments.service).
 *
 * Derived metrics map to aggregate/JSON expressions:
 *   lastOrderDaysAgo -> days since MAX(placedAt) (huge if never ordered)
 *   orderCount       -> COUNT(orders)
 *   lifetimeValue    -> SUM(order totals)
 *   attributes.<k>   -> customer.attributes ->> '<k>'
 *
 * Values are bound as $N placeholders (never interpolated) to avoid injection.
 */

const NUMERIC_EXPR: Record<string, string> = {
  lastOrderDaysAgo:
    'COALESCE(EXTRACT(DAY FROM (now() - MAX(o."placedAt")))::int, 999999)',
  orderCount: 'COUNT(o.id)::int',
  lifetimeValue: 'COALESCE(SUM(o.total), 0)::float',
};

const SQL_OP: Record<string, string> = {
  '>': '>',
  '>=': '>=',
  '<': '<',
  '<=': '<=',
  '=': '=',
  '!=': '<>',
};

export interface CompiledHaving {
  sql: string;
  params: unknown[];
}

export class SegmentCompiler {
  private params: unknown[] = [];

  /** Compile a rule tree; returns the HAVING SQL and ordered params. */
  static compile(rule: Rule | undefined | null): CompiledHaving {
    const c = new SegmentCompiler();
    const sql = rule ? c.node(rule) : 'TRUE';
    return { sql, params: c.params };
  }

  private node(rule: Rule): string {
    if (isGroup(rule)) {
      const join = rule.all ? ' AND ' : ' OR ';
      const children = (rule.all ?? rule.any ?? []).map((r) => this.node(r));
      if (children.length === 0) return 'TRUE';
      return `(${children.join(join)})`;
    }
    return this.leaf(rule);
  }

  private leaf(rule: LeafRule): string {
    const expr = this.fieldExpr(rule.field);
    const isAttr = rule.field.startsWith('attributes.');

    if (rule.op === 'in') {
      const values = Array.isArray(rule.value) ? rule.value : [rule.value];
      const ph = this.bind(values);
      return `${expr} = ANY(${ph})`;
    }

    const op = SQL_OP[rule.op];
    if (!op) throw new Error(`Unsupported operator: ${rule.op}`);

    // attributes are text; compare against the value as text. numeric metrics
    // compare numerically.
    const value = isAttr ? String(rule.value) : rule.value;
    const ph = this.bind(value);
    return `${expr} ${op} ${ph}`;
  }

  private fieldExpr(field: string): string {
    if (field.startsWith('attributes.')) {
      const key = field.slice('attributes.'.length);
      // bind the json key as a param too, to be safe
      const ph = this.bind(key);
      return `(c.attributes ->> ${ph})`;
    }
    const expr = NUMERIC_EXPR[field];
    if (!expr) throw new Error(`Unknown field: ${field}`);
    return expr;
  }

  private bind(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }
}
