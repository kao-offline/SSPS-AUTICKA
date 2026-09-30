export function normalizePrivateKey(value: string) {
    const source = value.trim().replace(/^["'`]+|["'`]+$/g, '').replace(/\\r\\n|\\n/g, '\n');
    const match = source.match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
    if (!match) throw new Error("JWT_PRIVATE_KEY must be a PKCS8 PEM key");
    const body = match[1].replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) throw new Error("Invalid JWT_PRIVATE_KEY encoding");
    return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----`;
}

if (process.env.JWT_PRIVATE_KEY) {
    process.env.JWT_PRIVATE_KEY = normalizePrivateKey(process.env.JWT_PRIVATE_KEY);
}
