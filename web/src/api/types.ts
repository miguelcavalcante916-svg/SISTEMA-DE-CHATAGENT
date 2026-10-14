export type Role = 'admin' | 'atendente';
export type OrderStatus = 'recebido' | 'confirmado' | 'em_preparo' | 'pronto' | 'saiu_para_entrega' | 'concluido' | 'cancelado';
export type PaymentStatus = 'pendente' | 'aguardando_pix' | 'pago' | 'falhou' | 'reembolsado' | 'nao_aplicavel';
export type Fulfillment = 'delivery' | 'pickup' | 'dine_in';
export type PaymentMethodId = 'pix' | 'dinheiro' | 'cartao_credito' | 'cartao_debito' | 'vale_refeicao' | 'outro';
export type BusinessCategory = 'pizzaria' | 'hamburgueria' | 'acaiteria' | 'sorveteria' | 'churrascaria' | 'bar' | 'outro';

export interface AuthUser {
  id: string;
  businessId: string;
  name: string;
  username: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface OpeningPeriod {
  open: string;
  close: string;
}
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface BusinessSettings {
  address: { street: string; number: string; complement: string; neighborhood: string; city: string; state: string; zip: string; reference: string };
  openingHours: Record<Weekday, OpeningPeriod[]>;
  closedDates: string[];
  channels: { manual: boolean; simulator: boolean; whatsapp: boolean };
  fulfillment: { delivery: boolean; pickup: boolean; dineIn: boolean; reservations: boolean };
  paymentMethods: { id: PaymentMethodId; label: string; enabled: boolean }[];
  minOrderCents: number;
  defaultPrepMinutes: number;
  deliveryExtraMinutes: number;
  pix: { enabled: boolean; keyType: 'cpf' | 'cnpj' | 'email' | 'phone' | 'evp' | null; key: string; receiverName: string; city: string; includeAmount: boolean; instructions: string };
  printer: {
    provider: 'browser' | 'escpos_network';
    paperWidthMm: 80 | 58;
    copies: number;
    cut: boolean;
    host: string;
    port: number;
    encoding: 'cp1252' | 'ascii';
    codepageCommand: number | null;
    headerText: string;
    footerText: string;
    autoPrintOnCreate: boolean;
  };
  handoff: { policy: string; keywords: string[]; confidenceThreshold: number };
  messages: {
    greeting: string;
    closed: string;
    privacyNotice: string;
    awaitingConfirmation: string;
    orderConfirmed: string;
    handoff: string;
    aiUnavailable: string;
    statusTemplates: Record<string, string>;
  };
  notifications: { enabled: boolean; statuses: OrderStatus[] };
  retention: { conversationDays: number; personalDataDays: number; auditDays: number };
  ai: { enabled: boolean; baseUrl: string | null; model: string | null; temperature: number; maxCatalogItems: number };
}

export interface Business {
  id: string;
  name: string;
  category: BusinessCategory;
  phone: string | null;
  contactEmail: string | null;
  timezone: string;
  settings: BusinessSettings;
  setupCompleted: boolean;
  dataReviewedAt: string | null;
  isDemo: boolean;
  pixKeyMasked: boolean;
  openNow: boolean;
}

export interface AuthStatus {
  needsSetup: boolean;
  authenticated: boolean;
  user: AuthUser | null;
  business: Business | null;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  archivedAt: string | null;
}
export interface Variant {
  id: string;
  name: string;
  priceCents: number;
  isAvailable: boolean;
  sortOrder: number;
  archivedAt: string | null;
}
export interface Option {
  id: string;
  name: string;
  priceCents: number;
  isAvailable: boolean;
  maxQuantity: number;
  sortOrder: number;
  archivedAt: string | null;
}
export interface OptionGroup {
  id: string;
  name: string;
  description: string | null;
  minSelect: number;
  maxSelect: number;
  pricingMode: 'sum' | 'max' | 'average';
  sortOrder: number;
  archivedAt: string | null;
  options: Option[];
}
export interface Product {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  kind: 'simple' | 'combo';
  isAvailable: boolean;
  availability: { days?: Weekday[]; start?: string; end?: string } | null;
  allowNotes: boolean;
  notesHint: string | null;
  prepMinutes: number | null;
  sortOrder: number;
  archivedAt: string | null;
  variants: Variant[];
  optionGroupIds: string[];
  comboItems: { productId: string; quantity: number }[];
}
export interface Catalog {
  categories: Category[];
  products: Product[];
  optionGroups: OptionGroup[];
}

export interface DeliveryZone {
  id: string;
  name: string;
  feeCents: number;
  minOrderCents: number;
  estimatedMinutes: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface Address {
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  reference: string;
}

export interface QuoteItemInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
  notes?: string | null;
  options: { optionId: string; quantity: number }[];
}

export interface Quote {
  ok: boolean;
  issues: { code: string; message: string; itemIndex?: number }[];
  items: { productId: string; productName: string; variantName: string | null; unitPriceCents: number; optionsPriceCents: number; quantity: number; lineTotalCents: number; notes: string | null; options: { optionName: string; priceCents: number; quantity: number }[] }[];
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  changeCents: number | null;
  deliveryZone: { id: string; name: string; feeCents: number } | null;
  minOrderCents: number;
  estimatedMinutes: number;
}

export interface OrderItem {
  id: string;
  productId: string | null;
  productName: string;
  variantId: string | null;
  variantName: string | null;
  unitPriceCents: number;
  optionsPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  notes: string | null;
  options: { groupName: string; optionName: string; priceCents: number; quantity: number }[];
}
export interface OrderEvent {
  id: string;
  type: string;
  fromValue: string | null;
  toValue: string | null;
  actorType: string;
  actorName: string | null;
  note: string | null;
  createdAt: string;
}
export interface Order {
  id: string;
  number: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethodId | null;
  fulfillment: Fulfillment;
  customer: { name: string; phone: string };
  address: Address | null;
  deliveryZone: { id: string | null; name: string } | null;
  tableLabel: string | null;
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  cashReceivedCents: number | null;
  changeCents: number | null;
  origin: string;
  conversationId: string | null;
  customerNotes: string | null;
  internalNotes: string | null;
  deliveryNotes: string | null;
  estimatedMinutes: number | null;
  customerConfirmedAt: string | null;
  paidConfirmedByName: string | null;
  paidConfirmedAt: string | null;
  printCount: number;
  lastPrintedAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  events: OrderEvent[];
  allowedStatuses: OrderStatus[];
  allowedPaymentStatuses: PaymentStatus[];
}

export interface Message {
  id: string;
  direction: 'in' | 'out';
  senderType: 'customer' | 'ai' | 'human' | 'system';
  senderUserId: string | null;
  senderName: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  deliveryStatus: 'n/a' | 'simulated' | 'queued' | 'sent' | 'failed';
  createdAt: string;
}
export interface Draft {
  items: QuoteItemInput[];
  fulfillment: Fulfillment | null;
  address: Address | null;
  deliveryZoneId: string | null;
  paymentMethod: PaymentMethodId | null;
  cashReceivedCents: number | null;
  customerName: string | null;
  awaitingConfirmation: boolean;
  lastOrderId: string | null;
}
export interface Conversation {
  id: string;
  channel: 'simulator' | 'whatsapp' | 'manual';
  externalId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  mode: 'ai' | 'human';
  status: 'open' | 'closed';
  needsHuman: boolean;
  needsHumanReason: string | null;
  takenOverByName: string | null;
  takenOverAt: string | null;
  draft: Draft;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  closedAt: string | null;
  createdAt: string;
  messages: Message[];
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  source: string;
  isActive: boolean;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface KnowledgeSuggestion {
  id: string;
  question: string;
  proposedAnswer: string | null;
  origin: string;
  conversationId: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface Receipt {
  kind: 'order' | 'test';
  title: string;
  disclaimer: string;
  businessName: string;
  businessPhone: string | null;
  headerText: string | null;
  footerText: string | null;
  orderNumber: string;
  createdAt: string;
  printedAt: string;
  reprint: boolean;
  printedBy: string | null;
  fulfillment: string;
  customerName: string | null;
  customerPhone: string | null;
  addressLines: string[];
  tableLabel: string | null;
  items: { quantity: number; name: string; variant: string | null; unitPriceCents: number; optionsPriceCents: number; lineTotalCents: number; options: { name: string; priceCents: number; quantity: number }[]; notes: string | null }[];
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  paymentMethod: string | null;
  paymentStatus: string;
  cashReceivedCents: number | null;
  changeCents: number | null;
  customerNotes: string | null;
  deliveryNotes: string | null;
  estimatedMinutes: number | null;
  origin: string;
}

export interface PublicUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface ChecklistItem {
  key: string;
  label: string;
  ok: boolean;
  required: boolean;
  hint: string;
}

export interface Profile {
  category: BusinessCategory;
  label: string;
  description: string;
  vocabulary: { product: string; variant: string; options: string; notesHint: string };
  categories: string[];
  suggestedVariants: string[];
  optionGroups: { name: string; minSelect: number; maxSelect: number; options: string[] }[];
  fulfillment: { delivery: boolean; pickup: boolean; dineIn: boolean; reservations: boolean };
  reviewNotes: string[];
}
