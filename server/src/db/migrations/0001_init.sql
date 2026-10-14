-- Esquema inicial. Datas em ISO 8601 UTC (TEXT). Dinheiro em centavos (INTEGER).
-- business_id presente nas tabelas centrais para futura expansão multiempresa.

CREATE TABLE businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'outro',
  phone TEXT,
  contact_email TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  settings_json TEXT NOT NULL DEFAULT '{}',
  setup_completed INTEGER NOT NULL DEFAULT 0,
  data_reviewed_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'atendente')),
  is_active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_users_business ON users(business_id);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE delivery_zones (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  min_order_cents INTEGER NOT NULL DEFAULT 0 CHECK (min_order_cents >= 0),
  estimated_minutes INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_zones_business ON delivery_zones(business_id);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_categories_business ON categories(business_id);

CREATE TABLE option_groups (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  description TEXT,
  min_select INTEGER NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select INTEGER NOT NULL DEFAULT 1 CHECK (max_select >= 1),
  pricing_mode TEXT NOT NULL DEFAULT 'sum' CHECK (pricing_mode IN ('sum', 'max', 'average')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_option_groups_business ON option_groups(business_id);

CREATE TABLE options (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES option_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  is_available INTEGER NOT NULL DEFAULT 1,
  max_quantity INTEGER NOT NULL DEFAULT 1 CHECK (max_quantity >= 1),
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_options_group ON options(group_id);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  image_url TEXT,
  kind TEXT NOT NULL DEFAULT 'simple' CHECK (kind IN ('simple', 'combo')),
  is_available INTEGER NOT NULL DEFAULT 1,
  availability_json TEXT,
  allow_notes INTEGER NOT NULL DEFAULT 1,
  notes_hint TEXT,
  prep_minutes INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_products_business ON products(business_id);
CREATE INDEX idx_products_category ON products(category_id);

CREATE TABLE product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  is_available INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_variants_product ON product_variants(product_id);

CREATE TABLE product_option_groups (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES option_groups(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, group_id)
);

CREATE TABLE combo_items (
  id TEXT PRIMARY KEY,
  combo_product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_combo_items_combo ON combo_items(combo_product_id);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  channel TEXT NOT NULL,
  external_id TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  mode TEXT NOT NULL DEFAULT 'ai' CHECK (mode IN ('ai', 'human')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  needs_human INTEGER NOT NULL DEFAULT 0,
  needs_human_reason TEXT,
  assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  taken_over_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  taken_over_at TEXT,
  draft_json TEXT NOT NULL DEFAULT '{}',
  last_message_at TEXT,
  last_customer_message_at TEXT,
  unread_count INTEGER NOT NULL DEFAULT 0,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_conversations_business_status ON conversations(business_id, status, last_message_at);
CREATE INDEX idx_conversations_external ON conversations(business_id, channel, external_id);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'ai', 'human', 'system')),
  sender_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  metadata_json TEXT,
  external_id TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'n/a' CHECK (delivery_status IN ('n/a', 'simulated', 'queued', 'sent', 'failed')),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('recebido', 'confirmado', 'em_preparo', 'pronto', 'saiu_para_entrega', 'concluido', 'cancelado')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('pendente', 'aguardando_pix', 'pago', 'falhou', 'reembolsado', 'nao_aplicavel')),
  payment_method TEXT,
  fulfillment TEXT NOT NULL CHECK (fulfillment IN ('delivery', 'pickup', 'dine_in')),
  customer_name TEXT,
  customer_phone TEXT,
  address_json TEXT,
  delivery_zone_id TEXT REFERENCES delivery_zones(id) ON DELETE SET NULL,
  delivery_zone_name TEXT,
  table_label TEXT,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  cash_received_cents INTEGER,
  change_cents INTEGER,
  origin TEXT NOT NULL,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  customer_notes TEXT,
  internal_notes TEXT,
  delivery_notes TEXT,
  estimated_minutes INTEGER,
  customer_confirmed_at TEXT,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  paid_confirmed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  paid_confirmed_at TEXT,
  print_count INTEGER NOT NULL DEFAULT 0,
  last_printed_at TEXT,
  cancel_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (business_id, number)
);
CREATE INDEX idx_orders_business_status ON orders(business_id, status, created_at);
CREATE INDEX idx_orders_business_created ON orders(business_id, created_at);
CREATE INDEX idx_orders_phone ON orders(business_id, customer_phone);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  variant_id TEXT,
  variant_name TEXT,
  unit_price_cents INTEGER NOT NULL,
  options_price_cents INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  line_total_cents INTEGER NOT NULL,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE order_item_options (
  id TEXT PRIMARY KEY,
  order_item_id TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  group_id TEXT,
  group_name TEXT NOT NULL,
  option_id TEXT,
  option_name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_order_item_options_item ON order_item_options(order_item_id);

CREATE TABLE order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system', 'customer', 'ai')),
  actor_user_id TEXT,
  actor_name TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_order_events_order ON order_events(order_id, created_at);

CREATE TABLE knowledge_entries (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'manual',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT,
  approved_by_user_id TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_knowledge_business ON knowledge_entries(business_id, is_active);

CREATE TABLE knowledge_suggestions (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  question TEXT NOT NULL,
  proposed_answer TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('unanswered', 'human_correction', 'outdated', 'low_confidence', 'ai_unavailable', 'manual')),
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by_user_id TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  knowledge_entry_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_suggestions_business_status ON knowledge_suggestions(business_id, status, created_at);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  business_id TEXT,
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details_json TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_business_created ON audit_log(business_id, created_at);

CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  business_id TEXT,
  payload_hash TEXT NOT NULL,
  signature_valid INTEGER NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  received_at TEXT NOT NULL,
  UNIQUE (provider, event_id)
);

CREATE TABLE print_jobs (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('order', 'reprint', 'test')),
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('done', 'failed', 'browser')),
  copies INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  user_id TEXT,
  user_name TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_print_jobs_order ON print_jobs(order_id);
