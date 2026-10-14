import { randomBytes, randomUUID } from 'node:crypto';

export const newId = (): string => randomUUID();

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');
