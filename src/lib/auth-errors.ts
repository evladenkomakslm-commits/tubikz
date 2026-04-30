/**
 * Auth-error sentinels — kept in a separate file so the client (LoginForm)
 * can import them without pulling node:crypto / prisma into its bundle.
 */
export const AUTH_ERR = {
  WRONG: 'wrong_credentials',
  NEEDS_2FA: 'needs_2fa',
  WRONG_2FA: 'wrong_2fa',
} as const;
