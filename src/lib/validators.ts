import { z } from 'zod';

export const usernameSchema = z
  .string()
  .min(3, 'минимум 3 символа')
  .max(24, 'максимум 24 символа')
  .regex(/^[a-z0-9_]+$/, 'только латиница в нижнем регистре, цифры и _');

export const emailSchema = z.string().email('некорректный email').max(120);

export const passwordSchema = z
  .string()
  .min(8, 'минимум 8 символов')
  .max(72, 'максимум 72 символа')
  .regex(/[A-Za-z]/, 'нужна хотя бы одна буква')
  .regex(/[0-9]/, 'нужна хотя бы одна цифра');

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'введи пароль'),
});

export const messageSchema = z.object({
  conversationId: z.string().min(1),
  type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'VOICE', 'FILE']).default('TEXT'),
  content: z.string().max(4000).optional(),
  mediaUrl: z.string().optional(),
  mediaMimeType: z.string().optional(),
  durationMs: z.number().int().positive().optional(),
});

export const profileUpdateSchema = z.object({
  displayName: z.string().min(1).max(40).optional(),
  bio: z.string().max(200).optional(),
  avatarUrl: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type MessageInput = z.infer<typeof messageSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
