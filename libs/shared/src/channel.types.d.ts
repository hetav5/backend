export type Channel = 'WHATSAPP' | 'SMS' | 'EMAIL' | 'RCS';
export declare const CHANNELS: Channel[];
export type CommunicationEventType = 'sent' | 'delivered' | 'opened' | 'read' | 'clicked' | 'failed' | 'converted';
export interface DispatchRequest {
    communicationId: string;
    recipient: string;
    channel: Channel;
    message: string;
}
export interface ReceiptEvent {
    eventId: string;
    communicationId: string;
    type: CommunicationEventType;
    occurredAt: string;
    raw?: Record<string, unknown>;
}
