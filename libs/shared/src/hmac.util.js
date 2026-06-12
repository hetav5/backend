"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SIGNATURE_HEADER = void 0;
exports.signBody = signBody;
exports.verifySignature = verifySignature;
const crypto_1 = require("crypto");
exports.SIGNATURE_HEADER = 'x-signature';
function signBody(rawBody, secret) {
    return (0, crypto_1.createHmac)('sha256', secret).update(rawBody).digest('hex');
}
function verifySignature(rawBody, signature, secret) {
    if (!signature)
        return false;
    const expected = signBody(rawBody, secret);
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    if (a.length !== b.length || a.length === 0)
        return false;
    return (0, crypto_1.timingSafeEqual)(a, b);
}
//# sourceMappingURL=hmac.util.js.map