import z from 'zod';

import { BadRequest, InvalidEmail, InvalidPasswordLength } from '../../base';

export function assertValidEmail(email: string) {
  const result = z.string().email().safeParse(email);
  if (!result.success) {
    throw new InvalidEmail({ email });
  }
}

export function assertValidPassword(
  password: string,
  { min, max }: { min: number; max: number }
) {
  const result = z.string().min(min).max(max).safeParse(password);

  if (!result.success) {
    throw new InvalidPasswordLength({ min, max });
  }
}

export function normalizeUsername(username: string) {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(normalized)) {
    throw new BadRequest('INVALID_USERNAME');
  }
  return normalized;
}

export function assertValidLogin(login: string) {
  const normalized = login.trim();
  if (!normalized || normalized.length > 320) {
    throw new BadRequest('INVALID_LOGIN');
  }
  return normalized;
}

export const validators = {
  assertValidEmail,
  assertValidLogin,
  assertValidPassword,
  normalizeUsername,
};
