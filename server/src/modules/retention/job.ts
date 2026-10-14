import type { FastifyInstance } from 'fastify';

export function startRetentionJob(_app: FastifyInstance): () => void {
  return () => {};
}
