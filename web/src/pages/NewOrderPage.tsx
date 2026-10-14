import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Address, Conversation, Fulfillment, Order, OptionGroup, PaymentMethodId, Product, Quote, QuoteItemInput } from '../api/types';
import { Alert, Button, Card, Check, Field, Input, Modal, PageHeader, Select, Spinner, Textarea } from '../components/ui';
import { useToast } from '../components/Toast';
import { useCatalog, useConversation, useOrder, useZones } from '../hooks/queries';
import { centsToInput, formatBRL, parseMoney } from '../lib/format';
import { FULFILLMENT_ICON, FULFILLMENT_LABEL } from '../lib/labels';
import { useAuth } from '../state/auth';

const emptyAddress: Address = { street: '', number: '', complement: '', neighborhood: '', city: '', reference: '' };

interface CartItem extends QuoteItemInput {
  key: string;
}

export function NewOrderPage() {
  const { id: editId } = useParams<{ id: string }>();
  const [sp] = useSearchParams();
  const conversationId = sp.get('conversa') ?? undefined;
  const { business } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const catalog = useCatalog();
  const zones = useZones();
  const existing = useOrder(editId);
  const conversation = useConversation(conversationId);

  const s = business?.settings;
  const enabledFulfillments = useMemo(() => {
    const list: Fulfillment[] = [];
    if (s?.fulfillment.delivery) list.push('delivery');
    if (s?.fulfillment.pickup) list.push('pickup');
    if (s?.fulfillment.dineIn) list.push('dine_in');
    return list;
  }, [s]);
  const paymentMethods = s?.paymentMethods.filter((m) => m.enabled) ?? [];

  const [items, setItems] = useState<CartItem[]>([]);
  const [fulfillment, setFulfillment] = useState<Fulfillment>('pickup');
  const [customer, setCustomer] = useState({ name: '', phone: '' });
  const [address, setAddress] = useState<Address>(emptyAddress);
  const [zoneId, setZoneId] = useState('');
  const [tableLabel, setTableLabel] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId | ''>('');
  const [cash, setCash] = useState('');
  const [discount, setDiscount] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [initialStatus, setInitialStatus] = useState<'recebido' | 'confirmado'>('recebido');
  const [configuring, setConfiguring] = useState<{ product: Product; item?: CartItem } | null>(null);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);

  useEffect(() => {
    if (enabledFulfillments.length && !enabledFulfillments.includes(fulfillment)) setFulfillment(enabledFulfillments[0]!);
  }, [enabledFulfillments, fulfillment]);

  // Pré-carrega de pedido existente (edição)
  useEffect(() => {
    const o = existing.data;
    if (!o || loadedFrom === o.id) return;
    setLoadedFrom(o.id);
    setItems(o.items.map((it, idx) => ({ key: `${idx}-${it.id}`, productId: it.productId ?? '', variantId: it.variantId, quantity: it.quantity, notes: it.notes, options: it.options.filter((op) => op.optionId).map((op) => ({ optionId: op.optionId!, quantity: op.quantity })) })));
    setFulfillment(o.fulfillment);
    setCustomer({ name: o.customer.name, phone: o.customer.phone });
    setAddress(o.address ?? emptyAddress);
    setZoneId(o.deliveryZone?.id ?? '');
    setTableLabel(o.tableLabel ?? '');
    setPaymentMethod(o.paymentMethod ?? '');
    setCash(centsToInput(o.cashReceivedCents));
    setDiscount(centsToInput(o.discountCents || null));
    setCustomerNotes(o.customerNotes ?? '');
    setInternalNotes(o.internalNotes ?? '');
    setDeliveryNotes(o.deliveryNotes ?? '');
    setConfirmed(true);
  }, [existing.data, loadedFrom]);

  // Pré-carrega do rascunho da conversa
  useEffect(() => {
    const c = conversation.data;
    if (!c || loadedFrom === c.id) return;
    setLoadedFrom(c.id);
    const d = c.draft;
    setItems(d.items.map((it, idx) => ({ key: `${idx}-${it.productId}`, ...it })));
    if (d.fulfillment) setFulfillment(d.fulfillment);
    setCustomer({ name: d.customerName ?? c.customerName ?? '', phone: c.customerPhone ?? '' });
    if (d.address) setAddress({ ...emptyAddress, ...d.address });
    if (d.deliveryZoneId) setZoneId(d.deliveryZoneId);
    if (d.paymentMethod) setPaymentMethod(d.paymentMethod);
    if (d.cashReceivedCents) setCash(centsToInput(d.cashReceivedCents));
  }, [conversation.data, loadedFrom]);

  const quoteBody = useMemo(
    () => ({
      items: items.map(({ key: _k, ...it }) => it),
      fulfillment,
      deliveryZoneId: fulfillment === 'delivery' && zoneId ? zoneId : null,
      discountCents: parseMoney(discount),
      paymentMethod: paymentMethod || null,
      cashReceivedCents: paymentMethod === 'dinheiro' && cash ? parseMoney(cash) : null,
    }),
    [items, fulfillment, zoneId, discount, paymentMethod, cash],
  );
  const quote = useQuery({
    queryKey: ['quote', JSON.stringify(quoteBody)],
    queryFn: () => api.post<{ quote: Quote }>('/api/orders/quote', quoteBody).then((r) => r.quote),
    enabled: items.length > 0,
    placeholderData: (prev) => prev,
  });

  const submit = useMutation({
    mutationFn: () => {
      const body = {
        ...quoteBody,
        customer,
        address: fulfillment === 'delivery' ? address : null,
        tableLabel: fulfillment === 'dine_in' ? tableLabel || null : null,
        customerNotes: customerNotes || null,
        internalNotes: internalNotes || null,
        deliveryNotes: deliveryNotes || null,
        customerConfirmed: confirmed,
        initialStatus,
      };
      if (editId) return api.put<{ order: Order }>(`/api/orders/${editId}`, body);
      if (conversationId) return api.post<{ order: Order }>(`/api/conversations/${conversationId}/order`, body);
      return api.post<{ order: Order }>('/api/orders', body);
    },
    onSuccess: (r) => {
      toast.success(`Pedido #${r.order.number} ${editId ? 'atualizado' : 'criado'}`);
      navigate(`/pedidos/${r.order.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (catalog.isLoading || !business) return <Spinner />;
  const cat = catalog.data!;
  const groups = new Map(cat.optionGroups.map((g) => [g.id, g]));
  const visibleProducts = cat.products.filter((p) => !p.archivedAt && (!categoryId || p.categoryId === categoryId) && (!search || p.name.toLowerCase().includes(search.toLowerCase())));
  const q = quote.data;
  const activeZones = (zones.data ?? []).filter((z) => z.isActive);

  const addOrUpdate = (item: CartItem) => {
    setItems((list) => (list.some((i) => i.key === item.key) ? list.map((i) => (i.key === item.key ? item : i)) : [...list, item]));
    setConfiguring(null);
  };

  return (
    <>
      <PageHeader
        title={editId ? `Editar pedido #${existing.data?.number ?? ''}` : conversationId ? 'Pedido a partir da conversa' : 'Novo pedido'}
        subtitle={conversationId ? `Conversa com ${conversation.data?.customerName ?? conversation.data?.customerPhone ?? '…'}` : 'O valor é calculado pelo servidor a partir do catálogo.'}
        actions={<Button onClick={() => navigate(-1)}>← Voltar</Button>}
      />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 1fr)' }}>
        <Card title="Cardápio">
          <div className="inline-fields">
            <input type="search" placeholder="Buscar produto…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar produto" />
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {cat.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid cols-3" style={{ marginTop: '0.75rem' }}>
            {visibleProducts.map((p) => (
              <button key={p.id} type="button" className="order-card" style={{ textAlign: 'left', opacity: p.isAvailable ? 1 : 0.5 }} onClick={() => setConfiguring({ product: p })} disabled={!p.isAvailable}>
                <strong>{p.name}</strong>
                {!p.isAvailable ? <span className="badge danger"> Indisponível</span> : null}
                <div className="small muted">{p.description}</div>
                <div>{p.variants.length ? p.variants.filter((v) => !v.archivedAt).map((v) => `${v.name} ${formatBRL(v.priceCents)}`).join(' · ') : formatBRL(p.priceCents)}</div>
              </button>
            ))}
            {visibleProducts.length === 0 ? <p className="muted">Nenhum produto. Cadastre no Catálogo.</p> : null}
          </div>
        </Card>

        <div className="stack">
          <Card title={`Itens (${items.length})`}>
            {items.length === 0 ? <p className="muted">Clique em um produto para adicionar.</p> : null}
            {items.map((it, idx) => {
              const p = cat.products.find((x) => x.id === it.productId);
              const qi = q?.items[idx];
              const issues = q?.issues.filter((i) => i.itemIndex === idx) ?? [];
              return (
                <div key={it.key} className="row between" style={{ borderBottom: '1px solid var(--border)', padding: '0.4rem 0' }}>
                  <div style={{ flex: 1 }}>
                    <strong>
                      {it.quantity}x {p?.name ?? '?'}
                      {qi?.variantName ? ` (${qi.variantName})` : ''}
                    </strong>
                    {qi?.options.length ? <div className="small muted">+ {qi.options.map((o) => o.optionName).join(', ')}</div> : null}
                    {it.notes ? <div className="small">Obs: {it.notes}</div> : null}
                    {issues.map((i) => (
                      <div key={i.code} className="small" style={{ color: 'var(--danger)' }}>
                        ⚠️ {i.message}
                      </div>
                    ))}
                  </div>
                  <div className="right">
                    <div>{qi ? formatBRL(qi.lineTotalCents) : '…'}</div>
                    <div className="row" style={{ gap: 4 }}>
                      <Button size="sm" onClick={() => p && setConfiguring({ product: p, item: it })} aria-label="Editar item">
                        ✏️
                      </Button>
                      <Button size="sm" onClick={() => setItems(items.filter((x) => x.key !== it.key))} aria-label="Remover item">
                        🗑️
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>

          <Card title="Entrega / retirada">
            <div className="row">
              {enabledFulfillments.map((f) => (
                <Button key={f} variant={fulfillment === f ? 'primary' : ''} onClick={() => setFulfillment(f)} aria-pressed={fulfillment === f}>
                  {FULFILLMENT_ICON[f]} {FULFILLMENT_LABEL[f]}
                </Button>
              ))}
            </div>
            <div className="inline-fields" style={{ marginTop: '0.75rem' }}>
              <Field label="Nome do cliente" required={fulfillment !== 'dine_in'}>
                <Input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
              </Field>
              <Field label="Telefone" required={fulfillment === 'delivery'}>
                <Input type="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="(11) 99999-0000" />
              </Field>
              {fulfillment === 'dine_in' ? (
                <Field label="Mesa/comanda">
                  <Input value={tableLabel} onChange={(e) => setTableLabel(e.target.value)} />
                </Field>
              ) : null}
            </div>
            {fulfillment === 'delivery' ? (
              <>
                <div className="inline-fields">
                  <Field label="Rua" required>
                    <Input value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} />
                  </Field>
                  <Field label="Número" required>
                    <Input value={address.number} onChange={(e) => setAddress({ ...address, number: e.target.value })} />
                  </Field>
                  <Field label="Complemento">
                    <Input value={address.complement} onChange={(e) => setAddress({ ...address, complement: e.target.value })} />
                  </Field>
                  <Field label="Bairro">
                    <Input value={address.neighborhood} onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })} />
                  </Field>
                  <Field label="Referência">
                    <Input value={address.reference} onChange={(e) => setAddress({ ...address, reference: e.target.value })} />
                  </Field>
                  {activeZones.length ? (
                    <Field label="Área de entrega (taxa)" required>
                      <Select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                        <option value="">Selecione…</option>
                        {activeZones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name} — {formatBRL(z.feeCents)}
                            {z.minOrderCents ? ` (mín. ${formatBRL(z.minOrderCents)})` : ''}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : (
                    <Alert kind="warning">Nenhuma área de entrega cadastrada: taxa R$ 0,00. Cadastre em Configurações.</Alert>
                  )}
                </div>
                <Field label="Observações de entrega">
                  <Input value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} placeholder="ex.: interfone quebrado" />
                </Field>
              </>
            ) : null}
          </Card>

          <Card title="Pagamento">
            <div className="inline-fields">
              <Field label="Forma de pagamento">
                <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethodId | '')}>
                  <option value="">Selecione…</option>
                  {paymentMethods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {paymentMethod === 'dinheiro' ? (
                <Field label="Troco para (R$)" hint="Deixe vazio se não precisar de troco">
                  <Input inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0,00" />
                </Field>
              ) : null}
              <Field label="Desconto (R$)">
                <Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0,00" />
              </Field>
            </div>
            <Field label="Observações do cliente">
              <Input value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} />
            </Field>
            <Field label="Observações internas" hint="Não aparecem ao cliente nem no comprovante">
              <Input value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
            </Field>
          </Card>

          <Card title="Resumo">
            {items.length === 0 ? <p className="muted">Adicione itens para ver o cálculo.</p> : null}
            {q ? (
              <>
                <table className="table">
                  <tbody>
                    <tr>
                      <td>Subtotal</td>
                      <td className="right">{formatBRL(q.subtotalCents)}</td>
                    </tr>
                    {q.discountCents ? (
                      <tr>
                        <td>Desconto</td>
                        <td className="right">-{formatBRL(q.discountCents)}</td>
                      </tr>
                    ) : null}
                    {fulfillment === 'delivery' ? (
                      <tr>
                        <td>Taxa de entrega{q.deliveryZone ? ` (${q.deliveryZone.name})` : ''}</td>
                        <td className="right">{formatBRL(q.deliveryFeeCents)}</td>
                      </tr>
                    ) : null}
                    <tr>
                      <td className="big">Total</td>
                      <td className="right big">{formatBRL(q.totalCents)}</td>
                    </tr>
                    {q.changeCents != null ? (
                      <tr>
                        <td>Troco</td>
                        <td className="right">{formatBRL(q.changeCents)}</td>
                      </tr>
                    ) : null}
                    <tr>
                      <td className="muted small">Previsão</td>
                      <td className="right small muted">{q.estimatedMinutes} min</td>
                    </tr>
                  </tbody>
                </table>
                {q.issues.filter((i) => i.itemIndex === undefined).map((i) => (
                  <Alert key={i.code} kind="warning">
                    {i.message}
                  </Alert>
                ))}
              </>
            ) : null}
            {!editId ? (
              <>
                <Check label="O cliente confirmou itens, endereço (se entrega), valor total e forma de pagamento" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                <Check label="Já entrar como Confirmado (pular 'Recebido')" checked={initialStatus === 'confirmado'} onChange={(e) => setInitialStatus(e.target.checked ? 'confirmado' : 'recebido')} />
              </>
            ) : null}
            <Button variant="primary" size="lg" className="block" style={{ marginTop: '0.75rem' }} disabled={items.length === 0 || (!editId && !confirmed) || (q ? !q.ok : true)} loading={submit.isPending} onClick={() => submit.mutate()}>
              {editId ? 'Salvar alterações' : `Criar pedido ${q ? formatBRL(q.totalCents) : ''}`}
            </Button>
          </Card>
        </div>
      </div>

      {configuring ? <ItemConfigurator product={configuring.product} groups={groups} initial={configuring.item} onClose={() => setConfiguring(null)} onSave={addOrUpdate} /> : null}
    </>
  );
}

function ItemConfigurator({ product, groups, initial, onClose, onSave }: { product: Product; groups: Map<string, OptionGroup>; initial?: CartItem; onClose: () => void; onSave: (item: CartItem) => void }) {
  const variants = product.variants.filter((v) => !v.archivedAt);
  const [variantId, setVariantId] = useState<string | null>(initial?.variantId ?? variants.find((v) => v.isAvailable)?.id ?? null);
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [selected, setSelected] = useState<Record<string, number>>(() => Object.fromEntries((initial?.options ?? []).map((o) => [o.optionId, o.quantity])));
  const linked = product.optionGroupIds.map((id) => groups.get(id)).filter((g): g is OptionGroup => Boolean(g) && !g!.archivedAt);

  const toggle = (optionId: string, max: number, groupCount: number, groupMax: number) => {
    setSelected((s) => {
      const cur = s[optionId] ?? 0;
      if (cur === 0) {
        if (groupCount >= groupMax) return s;
        return { ...s, [optionId]: 1 };
      }
      if (cur < max && groupCount < groupMax) return { ...s, [optionId]: cur + 1 };
      const { [optionId]: _removed, ...rest } = s;
      return rest;
    });
  };

  const save = () => {
    onSave({
      key: initial?.key ?? `${Date.now()}-${product.id}`,
      productId: product.id,
      variantId,
      quantity,
      notes: notes || null,
      options: Object.entries(selected).map(([optionId, q]) => ({ optionId, quantity: q })),
    });
  };

  return (
    <Modal
      title={product.name}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save} disabled={variants.length > 0 && !variantId}>
            {initial ? 'Atualizar item' : 'Adicionar'}
          </Button>
        </>
      }
    >
      {product.description ? <p className="muted">{product.description}</p> : null}
      {variants.length ? (
        <fieldset className="field">
          <legend className="label">Tamanho/variante</legend>
          <div className="row">
            {variants.map((v) => (
              <Button key={v.id} variant={variantId === v.id ? 'primary' : ''} disabled={!v.isAvailable} onClick={() => setVariantId(v.id)} aria-pressed={variantId === v.id}>
                {v.name} · {formatBRL(v.priceCents)}
                {!v.isAvailable ? ' (indisponível)' : ''}
              </Button>
            ))}
          </div>
        </fieldset>
      ) : (
        <p>
          Preço: <strong>{formatBRL(product.priceCents)}</strong>
        </p>
      )}
      {linked.map((g) => {
        const count = g.options.reduce((acc, o) => acc + (selected[o.id] ?? 0), 0);
        return (
          <fieldset key={g.id} className="field">
            <legend className="label">
              {g.name} <span className="small muted">({g.minSelect > 0 ? `obrigatório: ${g.minSelect}` : 'opcional'}, máx. {g.maxSelect}{g.pricingMode === 'max' ? ', cobra o de maior valor' : ''}) — {count} selecionado(s)</span>
            </legend>
            <div className="row">
              {g.options
                .filter((o) => !o.archivedAt)
                .map((o) => {
                  const q = selected[o.id] ?? 0;
                  return (
                    <Button key={o.id} size="sm" variant={q > 0 ? 'primary' : ''} disabled={!o.isAvailable} onClick={() => toggle(o.id, o.maxQuantity, count, g.maxSelect)} aria-pressed={q > 0}>
                      {q > 1 ? `${q}x ` : ''}
                      {o.name}
                      {o.priceCents ? ` +${formatBRL(o.priceCents)}` : ''}
                      {!o.isAvailable ? ' (indisp.)' : ''}
                    </Button>
                  );
                })}
            </div>
            {count < g.minSelect ? <span className="small" style={{ color: 'var(--danger)' }}>Escolha pelo menos {g.minSelect}.</span> : null}
          </fieldset>
        );
      })}
      <div className="inline-fields">
        <Field label="Quantidade">
          <Input type="number" min={1} max={99} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} />
        </Field>
        {product.allowNotes ? (
          <Field label="Observações" hint={product.notesHint ?? undefined}>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
        ) : null}
      </div>
    </Modal>
  );
}
