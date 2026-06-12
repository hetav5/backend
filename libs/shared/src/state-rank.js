"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statusForEvent = statusForEvent;
exports.shouldAdvance = shouldAdvance;
const RANK = {
    QUEUED: 0,
    SENT: 1,
    DELIVERED: 2,
    OPENED: 3,
    READ: 4,
    CLICKED: 5,
    FAILED: 99,
};
function statusForEvent(type) {
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
            return null;
    }
}
function shouldAdvance(current, next) {
    if (current === 'FAILED')
        return false;
    if (next === 'FAILED')
        return RANK[current] <= RANK['SENT'];
    return RANK[next] > RANK[current];
}
//# sourceMappingURL=state-rank.js.map