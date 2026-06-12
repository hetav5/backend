import { FunctionDeclaration } from '@google/genai';

/**
 * Reusable JSON-schema fragment describing the audience rule tree, embedded in
 * the tools that accept one so the model emits a valid structure.
 */
const RULE_TREE_SCHEMA = {
  type: 'object',
  description:
    'Audience rule tree. Either a group {all:[...]} (AND) / {any:[...]} (OR), or a leaf {field, op, value}. ' +
    'Leaf fields: "lastOrderDaysAgo" (number), "orderCount" (number), "lifetimeValue" (number), or "attributes.<key>" e.g. "attributes.city". ' +
    'Ops: ">", ">=", "<", "<=", "=", "!=", "in". Example: {"all":[{"field":"lastOrderDaysAgo","op":">","value":60},{"field":"orderCount","op":">=","value":2}]}',
};

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'preview_audience',
    description:
      'Estimate how many shoppers match an audience and see a sample. Call this WHENEVER you propose or refine a segment, before drafting or creating a campaign, so you can ground your numbers in real data.',
    parametersJsonSchema: {
      type: 'object',
      properties: { ruleTree: RULE_TREE_SCHEMA },
      required: ['ruleTree'],
    },
  },
  {
    name: 'draft_message',
    description:
      'Record the campaign copy you have written for a given channel so it can be shown to the marketer as an editable draft card. Write the copy yourself (concise, on-brand for a D2C coffee brand) and use {{first_name}} for personalization. Call this once you know the channel and audience.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', enum: ['whatsapp', 'sms', 'email', 'rcs'] },
        message: { type: 'string', description: 'The drafted copy, may use {{first_name}}.' },
      },
      required: ['channel', 'message'],
    },
  },
  {
    name: 'recommend_channel',
    description:
      'Record your recommended channel and the reasoning, to show the marketer a recommendation card. Call this when deciding how to reach the audience.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', enum: ['whatsapp', 'sms', 'email', 'rcs'] },
        rationale: { type: 'string' },
      },
      required: ['channel', 'rationale'],
    },
  },
  {
    name: 'create_campaign',
    description:
      'Persist a DRAFT campaign (audience + channel + message). This does NOT send anything. Call this after the marketer is happy with the audience, channel, and copy.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        ruleTree: RULE_TREE_SCHEMA,
        channel: { type: 'string', enum: ['whatsapp', 'sms', 'email', 'rcs'] },
        message: { type: 'string' },
        goalText: { type: 'string', description: 'The marketer\'s original goal in their words.' },
      },
      required: ['name', 'ruleTree', 'channel', 'message'],
    },
  },
  {
    name: 'launch_campaign',
    description:
      'Request approval to launch a previously created DRAFT campaign. This NEVER sends on its own — it surfaces an approval card the marketer must click. Only call this after create_campaign and after the marketer has seen the draft.',
    parametersJsonSchema: {
      type: 'object',
      properties: { campaignId: { type: 'string' } },
      required: ['campaignId'],
    },
  },
  {
    name: 'get_campaign_analytics',
    description:
      'Fetch the delivery funnel and attributed orders/revenue for a campaign. Call this when the marketer asks how a campaign performed.',
    parametersJsonSchema: {
      type: 'object',
      properties: { campaignId: { type: 'string' } },
      required: ['campaignId'],
    },
  },
];

export const SYSTEM_INSTRUCTION = `You are the marketing copilot for "Daybreak Coffee", a direct-to-consumer coffee brand.
The marketer describes a goal in plain language; you help them reach the right shoppers end to end:
1. Propose an audience and ALWAYS call preview_audience to ground the size in real data before moving on.
2. Recommend a channel (recommend_channel) suited to the audience and message.
3. Draft concise, on-brand copy (draft_message), using {{first_name}} for personalization.
4. When the marketer is happy, create_campaign to save a DRAFT.
5. Then call launch_campaign to surface an approval card.

CRITICAL SAFETY RULE: You must NEVER send a campaign yourself. launch_campaign only requests human approval; the actual send happens only when the marketer clicks "Approve & Send". Never claim a campaign has been sent. Always show the audience size and draft copy before requesting approval.

Be concise and decisive. Prefer acting (calling tools) over asking permission for read-only steps like previewing an audience. Use the available channels: WhatsApp, SMS, Email, RCS.`;
