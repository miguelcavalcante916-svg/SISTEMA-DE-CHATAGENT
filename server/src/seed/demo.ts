import { randomBytes } from 'node:crypto';
import type { DB } from '../db/connection.js';
import { newId } from '../lib/ids.js';
import { nowIso } from '../lib/time.js';
import { hashPassword } from '../modules/auth/password.js';
import { createBusiness, updateBusiness } from '../modules/business/service.js';
import { createZone } from '../modules/business/zones.js';
import { createCategory, createOptionGroup, createProduct } from '../modules/catalog/service.js';
import { createEntry } from '../modules/knowledge/service.js';

export interface DemoSeedResult {
  businessId: string;
  adminUsername: string;
  adminPassword: string;
  attendantUsername: string;
  attendantPassword: string;
}

const genPassword = () => `Demo-${randomBytes(6).toString('base64url')}`;

/**
 * Dados de demonstração CLARAMENTE FICTÍCIOS. Nunca use em produção.
 * Recusa-se a rodar se já houver usuários cadastrados.
 */
export function seedDemo(db: DB): DemoSeedResult {
  const users = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  if (users > 0) throw new Error('Já existem usuários neste banco. O seed de demonstração só roda em banco vazio.');

  const business = createBusiness(db, { name: 'Pizzaria Exemplo (DEMO)', category: 'pizzaria', timezone: 'America/Sao_Paulo', phone: '(00) 00000-0000', isDemo: true });
  const b = business.id;
  const all = [{ open: '18:00', close: '23:30' }];
  updateBusiness(db, b, {
    setupCompleted: true,
    settings: {
      address: { street: 'Rua Fictícia', number: '123', neighborhood: 'Centro (DEMO)', city: 'Cidade Exemplo', state: 'EX' },
      openingHours: { mon: [], tue: all, wed: all, thu: all, fri: all, sat: all, sun: all },
      fulfillment: { delivery: true, pickup: true, dineIn: false, reservations: false },
      paymentMethods: [
        { id: 'pix', label: 'Pix', enabled: true },
        { id: 'dinheiro', label: 'Dinheiro', enabled: true },
        { id: 'cartao_credito', label: 'Cartão de crédito (na entrega)', enabled: true },
        { id: 'cartao_debito', label: 'Cartão de débito (na entrega)', enabled: false },
        { id: 'vale_refeicao', label: 'Vale-refeição', enabled: false },
        { id: 'outro', label: 'Outro', enabled: false },
      ],
      minOrderCents: 2500,
      defaultPrepMinutes: 40,
      pix: { enabled: false, keyType: null, key: '', receiverName: 'PIZZARIA EXEMPLO', city: 'CIDADE EXEMPLO' },
    },
  });

  createZone(db, b, { name: 'Centro (DEMO)', feeCents: 500, minOrderCents: 2500, estimatedMinutes: 20, isActive: true, sortOrder: 0 });
  createZone(db, b, { name: 'Bairro Modelo (DEMO)', feeCents: 800, minOrderCents: 3000, estimatedMinutes: 35, isActive: true, sortOrder: 1 });

  const salgadas = createCategory(db, b, { name: 'Pizzas salgadas (DEMO)', sortOrder: 0 });
  const doces = createCategory(db, b, { name: 'Pizzas doces (DEMO)', sortOrder: 1 });
  const bebidas = createCategory(db, b, { name: 'Bebidas (DEMO)', sortOrder: 2 });

  const sabores = createOptionGroup(db, b, {
    name: 'Sabores (meio a meio)',
    description: 'Até 2 sabores; cobra-se o de maior valor.',
    minSelect: 1,
    maxSelect: 2,
    pricingMode: 'max',
    sortOrder: 0,
    options: [
      { name: 'Mussarela', priceCents: 0, isAvailable: true, maxQuantity: 1, sortOrder: 0 },
      { name: 'Calabresa', priceCents: 0, isAvailable: true, maxQuantity: 1, sortOrder: 1 },
      { name: 'Portuguesa', priceCents: 500, isAvailable: true, maxQuantity: 1, sortOrder: 2 },
      { name: 'Quatro queijos', priceCents: 800, isAvailable: true, maxQuantity: 1, sortOrder: 3 },
    ],
  });
  const borda = createOptionGroup(db, b, {
    name: 'Borda recheada',
    minSelect: 0,
    maxSelect: 1,
    pricingMode: 'sum',
    sortOrder: 1,
    options: [
      { name: 'Catupiry', priceCents: 700, isAvailable: true, maxQuantity: 1, sortOrder: 0 },
      { name: 'Cheddar', priceCents: 700, isAvailable: true, maxQuantity: 1, sortOrder: 1 },
    ],
  });
  const adicionais = createOptionGroup(db, b, {
    name: 'Adicionais',
    minSelect: 0,
    maxSelect: 5,
    pricingMode: 'sum',
    sortOrder: 2,
    options: [
      { name: 'Bacon', priceCents: 400, isAvailable: true, maxQuantity: 2, sortOrder: 0 },
      { name: 'Queijo extra', priceCents: 500, isAvailable: true, maxQuantity: 1, sortOrder: 1 },
      { name: 'Azeitona', priceCents: 200, isAvailable: true, maxQuantity: 1, sortOrder: 2 },
    ],
  });

  createProduct(db, b, {
    categoryId: salgadas.id,
    name: 'Pizza salgada (DEMO)',
    description: 'Monte com até 2 sabores.',
    priceCents: 0,
    kind: 'simple',
    isAvailable: true,
    allowNotes: true,
    notesHint: 'ex.: sem cebola, bem assada',
    sortOrder: 0,
    variants: [
      { name: 'Média (6 fatias)', priceCents: 4500, isAvailable: true, sortOrder: 0 },
      { name: 'Grande (8 fatias)', priceCents: 5500, isAvailable: true, sortOrder: 1 },
      { name: 'Família (12 fatias)', priceCents: 6900, isAvailable: true, sortOrder: 2 },
    ],
    optionGroupIds: [sabores.id, borda.id, adicionais.id],
    comboItems: [],
  });
  createProduct(db, b, {
    categoryId: doces.id,
    name: 'Pizza de chocolate (DEMO)',
    description: 'Chocolate ao leite com granulado.',
    priceCents: 4200,
    kind: 'simple',
    isAvailable: true,
    allowNotes: true,
    notesHint: null,
    sortOrder: 0,
    variants: [],
    optionGroupIds: [borda.id],
    comboItems: [],
  });
  createProduct(db, b, { categoryId: bebidas.id, name: 'Refrigerante 2 L (DEMO)', priceCents: 1200, kind: 'simple', isAvailable: true, allowNotes: false, sortOrder: 0, variants: [], optionGroupIds: [], comboItems: [] });
  createProduct(db, b, { categoryId: bebidas.id, name: 'Água mineral 500 ml (DEMO)', priceCents: 400, kind: 'simple', isAvailable: true, allowNotes: false, sortOrder: 1, variants: [], optionGroupIds: [], comboItems: [] });

  const now = nowIso();
  const adminId = newId();
  const attendantId = newId();
  const adminPassword = genPassword();
  const attendantPassword = genPassword();
  db.prepare(
    `INSERT INTO users (id, business_id, name, username, password_hash, role, is_active, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'admin', 1, 1, ?, ?)`,
  ).run(adminId, b, 'Administrador (DEMO)', 'admin', hashPassword(adminPassword), now, now);
  db.prepare(
    `INSERT INTO users (id, business_id, name, username, password_hash, role, is_active, must_change_password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'atendente', 1, 1, ?, ?)`,
  ).run(attendantId, b, 'Atendente (DEMO)', 'atendente', hashPassword(attendantPassword), now, now);

  createEntry(db, b, { title: 'Estacionamento (exemplo fictício)', content: 'Exemplo de conhecimento aprovado: há 3 vagas na frente da loja. Substitua pelas informações reais.', tags: ['exemplo'] }, adminId);

  return { businessId: b, adminUsername: 'admin', adminPassword, attendantUsername: 'atendente', attendantPassword };
}
