export type LeafField = 'lastOrderDaysAgo' | 'orderCount' | 'lifetimeValue' | `attributes.${string}`;
export type LeafOp = '>' | '>=' | '<' | '<=' | '=' | '!=' | 'in';
export interface LeafRule {
    field: LeafField;
    op: LeafOp;
    value: number | string | (number | string)[];
}
export interface GroupRule {
    all?: Rule[];
    any?: Rule[];
}
export type Rule = LeafRule | GroupRule;
export declare function isGroup(rule: Rule): rule is GroupRule;
