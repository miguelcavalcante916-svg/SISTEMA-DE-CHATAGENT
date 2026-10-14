import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { recordAudit } from '../audit/service.js';
import { createBackup, deleteBackup, listBackups, safeBackupPath, verifyBackupFile } from './service.js';

export async function backupRoutes(app: FastifyInstance): Promise<void> {
  const { db, config } = app.ctx;

  app.get('/api/backup', { config: { auth: 'admin' } }, async () => ({ backups: listBackups(config.backupDir), dir: config.backupDir, databasePath: config.databasePath }));

  app.post('/api/backup', { config: { auth: 'admin' } }, async (request, reply) => {
    const result = createBackup(db, config.backupDir);
    recordAudit(db, { businessId: request.user!.businessId, userId: request.user!.id, userName: request.user!.name, action: 'backup.created', details: { file: result.file, bytes: result.bytes, ok: result.verification.ok }, ip: request.ip });
    reply.code(201);
    return { backup: result };
  });

  app.post('/api/backup/:file/verify', { config: { auth: 'admin' } }, async (request) => {
    const { file } = request.params as { file: string };
    return { file, verification: verifyBackupFile(safeBackupPath(config.backupDir, file)) };
  });

  app.get('/api/backup/:file/download', { config: { auth: 'admin' } }, async (request, reply) => {
    const { file } = request.params as { file: string };
    const full = safeBackupPath(config.backupDir, file);
    recordAudit(db, { businessId: request.user!.businessId, userId: request.user!.id, userName: request.user!.name, action: 'backup.downloaded', details: { file }, ip: request.ip });
    reply.header('content-type', 'application/octet-stream');
    reply.header('content-disposition', `attachment; filename="${file}"`);
    return reply.send(createReadStream(full));
  });

  app.delete('/api/backup/:file', { config: { auth: 'admin' } }, async (request) => {
    const { file } = request.params as { file: string };
    deleteBackup(config.backupDir, file);
    recordAudit(db, { businessId: request.user!.businessId, userId: request.user!.id, userName: request.user!.name, action: 'backup.deleted', details: { file }, ip: request.ip });
    return { ok: true };
  });
}
