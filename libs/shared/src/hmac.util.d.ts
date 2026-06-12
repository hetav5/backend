export declare const SIGNATURE_HEADER = "x-signature";
export declare function signBody(rawBody: string, secret: string): string;
export declare function verifySignature(rawBody: string, signature: string | undefined, secret: string): boolean;
