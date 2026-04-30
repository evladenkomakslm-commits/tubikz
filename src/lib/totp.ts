import { generateSecret, generateURI, verifySync } from 'otplib';

/**
 * Generate a fresh TOTP secret + provisioning URI for the given user.
 * The URI is meant to be encoded as a QR for Google Authenticator / 1Password / etc.
 */
export function newTotpSecret(username: string) {
  const secret = generateSecret();
  const uri = generateURI({
    strategy: 'totp',
    issuer: '₮ubikz',
    label: username,
    secret,
  });
  return { secret, uri };
}

export function verifyTotp(secret: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  try {
    const result = verifySync({ strategy: 'totp', secret, token });
    return !!result.valid;
  } catch {
    return false;
  }
}
