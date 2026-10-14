import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { badRequest, conflict, forbidden, notFound, tooManyRequests, unauthorized } from '../../lib/errors.js';
import { newId } from '../../lib/ids.js';
import { nowIso } from '../../lib/time.js';
import { parse } from '../../lib/validate.js';
import { recordAudit } from '../audit/service.js';
import { countBusinesses, createBusiness, CreateBusinessSchema, getBusiness, toBusinessDto } from '../business/service.js';
import { hashPassword, validatePasswordPolicy, verifyPassword } from './password.js';
import { createSession, deleteSession, deleteUserSessions, findUserBySession, SESSION_COOKIE } from './session.js';
import { toAuthUser, toPublicUser, type UserRow } from './types.js';

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9._-]+$/i, 'Use apenas letras, números, ponto, hífen ou sublinhado');

const SetupSchema = z.object({
  business: CreateBusinessSchema,
  admin: z.object({
    name: z.string().trim().min(2).max(80),
    username: usernameSchema,
    password: z.string().min(8).max(128),
  }),
});

const LoginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(128),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

const CreateUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  username: usernameSchema,
  password: z.string().min(8).max(128),
  role: z.enum(['admin', 'atendente']),
});

const UpdateUserSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(['admin', 'atendente']).optional(),
  isActive: z.boolean().optional(),
  newPassword: z.string().min(8).max(128).optional(),
});

function setSessionCookie(app: FastifyInstance, reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: app.ctx.config.sessionCookieSecure,
    path: '/',
    maxAge: Math.floor(app.ctx.config.sessionTtlHours * 3600),
  });
}

export function countUsers(app: FastifyInstance): number {
  return (app.ctx.db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const { db, config, loginLimiter } = app.ctx;

  app.get('/api/auth/status', { config: { auth: 'public' } }, async (request) => {
    const needsSetup = countUsers(app) === 0 || countBusinesses(db) === 0;
    const user = request.user;
    const business = user ? toBusinessDto(getBusiness(db, user.businessId), { revealSecrets: user.role === 'admin' }) : null;
    return { needsSetup, authenticated: Boolean(user), user, business };
  });

  app.post('/api/auth/setup', { config: { auth: 'public' } }, async (request, reply) => {
    if (countUsers(app) > 0) throw conflict('A configuração inicial já foi feita. Faça login.');
    const body = parse(SetupSchema, request.body);
    const policyError = validatePasswordPolicy(body.admin.password, body.admin.username);
    if (policyError) throw badRequest(policyError);

    const now = nowIso();
    const result = db.transaction(() => {
      const business = createBusiness(db, body.business);
      const userId = newId();
      db.prepare(
        `INSERT INTO users (id, business_id, name, username, password_hash, role, is_active, must_change_password, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'admin', 1, 0, ?, ?)`,
      ).run(userId, business.id, body.admin.name, body.admin.username, hashPassword(body.admin.password), now, now);
      recordAudit(db, {
        businessId: business.id,
        userId,
        userName: body.admin.name,
        action: 'setup.completed',
        entityType: 'business',
        entityId: business.id,
        ip: request.ip,
      });
      return { business, userId };
    })();

    const session = createSession(db, result.userId, config.sessionTtlHours, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    setSessionCookie(app, reply, session.token);
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(result.userId) as UserRow;
    return { user: toAuthUser(row), business: toBusinessDto(result.business, { revealSecrets: true }) };
  });

  app.post('/api/auth/login', { config: { auth: 'public' } }, async (request, reply) => {
    const body = parse(LoginSchema, request.body);
    const key = `${request.ip}|${body.username.toLowerCase()}`;
    if (loginLimiter.isBlocked(key)) throw tooManyRequests();
    const row = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(body.username) as
      | UserRow
      | undefined;
    const ok = row && row.is_active === 1 && verifyPassword(body.password, row.password_hash);
    if (!ok) {
      loginLimiter.registerFailure(key);
      recordAudit(db, {
        businessId: row?.business_id ?? null,
        action: 'auth.login_failed',
        details: { username: body.username.toLowerCase() },
        ip: request.ip,
      });
      throw unauthorized('Usuário ou senha inválidos');
    }
    loginLimiter.reset(key);
    const session = createSession(db, row.id, config.sessionTtlHours, {
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), row.id);
    recordAudit(db, { businessId: row.business_id, userId: row.id, userName: row.name, action: 'auth.login', ip: request.ip });
    setSessionCookie(app, reply, session.token);
    return { user: toAuthUser(row) };
  });

  app.post('/api/auth/logout', { config: { auth: 'public' } }, async (request, reply) => {
    if (request.sessionToken) deleteSession(db, request.sessionToken);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (request) => {
    return { user: request.user };
  });

  app.post('/api/auth/change-password', async (request) => {
    const user = request.user!;
    const body = parse(ChangePasswordSchema, request.body);
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as UserRow;
    if (!verifyPassword(body.currentPassword, row.password_hash)) throw badRequest('Senha atual incorreta');
    const policyError = validatePasswordPolicy(body.newPassword, row.username);
    if (policyError) throw badRequest(policyError);
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?').run(
      hashPassword(body.newPassword),
      nowIso(),
      user.id,
    );
    // encerra outras sessões; a atual continua válida
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(
      user.id,
      request.sessionTokenHash ?? '',
    );
    recordAudit(db, { businessId: user.businessId, userId: user.id, userName: user.name, action: 'auth.password_changed', ip: request.ip });
    return { ok: true };
  });

  // ----- Usuários (admin) -----
  app.get('/api/users', { config: { auth: 'admin' } }, async (request) => {
    const rows = db
      .prepare('SELECT * FROM users WHERE business_id = ? ORDER BY created_at ASC')
      .all(request.user!.businessId) as UserRow[];
    return { users: rows.map(toPublicUser) };
  });

  app.post('/api/users', { config: { auth: 'admin' } }, async (request, reply) => {
    const actor = request.user!;
    const body = parse(CreateUserSchema, request.body);
    const policyError = validatePasswordPolicy(body.password, body.username);
    if (policyError) throw badRequest(policyError);
    const exists = db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(body.username);
    if (exists) throw conflict('Já existe um usuário com esse nome de acesso');
    const now = nowIso();
    const id = newId();
    db.prepare(
      `INSERT INTO users (id, business_id, name, username, password_hash, role, is_active, must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
    ).run(id, actor.businessId, body.name, body.username, hashPassword(body.password), body.role, now, now);
    recordAudit(db, {
      businessId: actor.businessId,
      userId: actor.id,
      userName: actor.name,
      action: 'user.created',
      entityType: 'user',
      entityId: id,
      details: { role: body.role, username: body.username },
      ip: request.ip,
    });
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow;
    reply.code(201);
    return { user: toPublicUser(row) };
  });

  app.patch('/api/users/:id', { config: { auth: 'admin' } }, async (request) => {
    const actor = request.user!;
    const { id } = request.params as { id: string };
    const body = parse(UpdateUserSchema, request.body);
    const row = db.prepare('SELECT * FROM users WHERE id = ? AND business_id = ?').get(id, actor.businessId) as
      | UserRow
      | undefined;
    if (!row) throw notFound('Usuário não encontrado');

    const becomesInactive = body.isActive === false;
    const losesAdmin = body.role === 'atendente' && row.role === 'admin';
    if ((becomesInactive || losesAdmin) && row.role === 'admin') {
      const admins = (
        db
          .prepare("SELECT COUNT(*) AS c FROM users WHERE business_id = ? AND role = 'admin' AND is_active = 1 AND id <> ?")
          .get(actor.businessId, row.id) as { c: number }
      ).c;
      if (admins === 0) throw badRequest('É necessário manter pelo menos um administrador ativo');
    }
    if (row.id === actor.id && becomesInactive) throw badRequest('Você não pode desativar o próprio acesso');

    if (body.newPassword) {
      const policyError = validatePasswordPolicy(body.newPassword, row.username);
      if (policyError) throw badRequest(policyError);
    }
    db.prepare(
      `UPDATE users SET name = ?, role = ?, is_active = ?, password_hash = ?, must_change_password = ?, updated_at = ? WHERE id = ?`,
    ).run(
      body.name ?? row.name,
      body.role ?? row.role,
      body.isActive === undefined ? row.is_active : body.isActive ? 1 : 0,
      body.newPassword ? hashPassword(body.newPassword) : row.password_hash,
      body.newPassword ? 1 : row.must_change_password,
      nowIso(),
      row.id,
    );
    if (becomesInactive || body.newPassword) deleteUserSessions(db, row.id);
    recordAudit(db, {
      businessId: actor.businessId,
      userId: actor.id,
      userName: actor.name,
      action: 'user.updated',
      entityType: 'user',
      entityId: row.id,
      details: { role: body.role, isActive: body.isActive, passwordReset: Boolean(body.newPassword) },
      ip: request.ip,
    });
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(row.id) as UserRow;
    return { user: toPublicUser(updated) };
  });
}

/** Hook: identifica o usuário pela sessão e aplica o nível de acesso da rota. */
export async function authenticateRequest(app: FastifyInstance, request: FastifyRequest): Promise<void> {
  request.user = null;
  request.sessionToken = null;
  request.sessionTokenHash = null;
  const token = request.cookies[SESSION_COOKIE];
  if (token) {
    const row = findUserBySession(app.ctx.db, token);
    if (row) {
      request.user = toAuthUser(row);
      request.sessionToken = token;
      const { createHash } = await import('node:crypto');
      request.sessionTokenHash = createHash('sha256').update(token).digest('hex');
    }
  }
  const level = request.routeOptions.config.auth ?? 'user';
  if (level === 'public') return;
  if (!request.user) throw unauthorized();
  if (level === 'admin' && request.user.role !== 'admin') throw forbidden('Apenas administradores podem fazer isso');
}
