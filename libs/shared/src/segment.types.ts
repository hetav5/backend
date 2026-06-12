/**
 * Audience segmentation rule tree. Compiled to SQL by the CRM `segments` module
 * and also produced by the agent's `preview_audience` tool from natural language.
 *
 * Derived per-customer metrics available as fields:
 *  - lastOrderDaysAgo : number  (days since most recent order; large if never)
 *  - orderCount       : number  (total orders)
 *  - lifetimeValue    : number  (sum of order totals)
 *  - attributes.<key> : any     (jsonb attribute, e.g. attributes.city)
 */
export type LeafField =
  | 'lastOrderDaysAgo'
  | 'orderCount'
  | 'lifetimeValue'
  | `attributes.${string}`;

export type LeafOp = '>' | '>=' | '<' | '<=' | '=' | '!=' | 'in';

export interface LeafRule {
  field: LeafField;
  op: LeafOp;
  value: number | string | (number | string)[];
}

export interface GroupRule {
  all?: Rule[]; // AND
  any?: Rule[]; // OR
}

export type Rule = LeafRule | GroupRule;

export function isGroup(rule: Rule): rule is GroupRule {
  return (rule as GroupRule).all !== undefined || (rule as GroupRule).any !== undefined;
}
