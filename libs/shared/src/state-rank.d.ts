export type CommStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'OPENED' | 'READ' | 'CLICKED' | 'FAILED';
export declare function statusForEvent(type: string): CommStatus | null;
export declare function shouldAdvance(current: CommStatus, next: CommStatus): boolean;
