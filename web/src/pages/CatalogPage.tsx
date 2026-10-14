import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Category, OptionGroup, Product, Weekday } from '../api/types';
import { Alert, Button, Card, Check, Empty, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner, Textarea } from '../components/ui';
import { useToast } from '../components/Toast';
import { useCatalog } from '../hooks/queries';
import { centsToInput, formatBRL, parseMoney } from '../lib/format';
import { WEEKDAY_LABEL } from '../lib/labels';
import { useAuth } from '../state/auth';

type Tab = 'products' | 'categories' | 'groups';

export function CatalogPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>('products');
  const [showArchived, setShowArchived] = useState(false);
  const catalog = useCatalog(showArchived);
  const qc = useQueryClient();
  const toast = useToast();
  const [editingProduct, setEditingProduct] = useState<Product | 'new' | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | 'new' | null>(null);
  const [editingGroup, setEditingGroup] = useState<OptionGroup | 'new' | null>(null);

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['catalog'] });
  const availability = useMutation({
    mutationFn: (p: { kind: 'products' | 'variants' | 'options'; id: string; isAvailable: boolean }) => api.patch(`/api/catalog/${p.kind}/${p.id}/availability`, { isAvailable: p.isAvailable }),
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const archive = useMutation({
    mutationFn: (p: { kind: 'products' | 'option-groups'; id: string; archived: boolean }) => api.patch(`/api/catalog/${p.kind}/${p.id}/archive`, { archived: p.archived }),
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (catalog.isLoading) return <Spinner />;
  if (catalog.error || !catalog.data) return <ErrorBox error={catalog.error} retry={() => void catalog.refetch()} />;
  const data = catalog.data;
  const groups = new Map(data.optionGroups.map((g) => [g.id, g]));

  return (
    <>
      <PageHeader
        title="Catálogo"
        subtitle={isAdmin ? 'Produtos, preços, variantes e adicionais usados no cálculo dos pedidos.' : 'Você pode marcar itens como disponíveis/indisponíveis.'}
        actions={
          <>
            <Check label="Mostrar arquivados" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            {isAdmin && tab === 'products' ? <Button variant="primary" onClick={() => setEditingProduct('new')}>➕ Produto</Button> : null}
            {isAdmin && tab === 'categories' ? <Button variant="primary" onClick={() => setEditingCategory('new')}>➕ Categoria</Button> : null}
            {isAdmin && tab === 'groups' ? <Button variant="primary" onClick={() => setEditingGroup('new')}>➕ Grupo de adicionais</Button> : null}
          </>
        }
      />
      <div className="tabs" role="tablist">
        <button type="button" role="tab" className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>Produtos ({data.products.length})</button>
        <button type="button" role="tab" className={tab === 'categories' ? 'active' : ''} onClick={() => setTab('categories')}>Categorias ({data.categories.length})</button>
        <button type="button" role="tab" className={tab === 'groups' ? 'active' : ''} onClick={() => setTab('groups')}>Adicionais ({data.optionGroups.length})</button>
      </div>

      {tab === 'products' ? (
        <div className="stack">
          {data.products.length === 0 ? <Empty icon="🍕" title="Nenhum produto">Cadastre produtos com preço para começar a vender.</Empty> : null}
          {[...data.categories, { id: '', name: 'Sem categoria' } as Category].map((c) => {
            const list = data.products.filter((p) => (p.categoryId ?? '') === c.id);
            if (list.length === 0) return null;
            return (
              <Card key={c.id || 'none'} title={c.name}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Preço</th>
                      <th>Adicionais</th>
                      <th>Disponível</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p) => (
                      <tr key={p.id} style={{ opacity: p.archivedAt ? 0.5 : 1 }}>
                        <td>
                          <strong>{p.name}</strong> {p.kind === 'combo' ? <span className="badge info">combo</span> : null} {p.archivedAt ? <span className="badge">arquivado</span> : null}
                          <div className="small muted">{p.description}</div>
                          {p.variants.length ? (
                            <div className="pill-list" style={{ marginTop: 4 }}>
                              {p.variants.filter((v) => !v.archivedAt).map((v) => (
                                <button key={v.id} type="button" className={`badge ${v.isAvailable ? 'success' : 'danger'}`} onClick={() => availability.mutate({ kind: 'variants', id: v.id, isAvailable: !v.isAvailable })} title="Alternar disponibilidade da variante">
                                  {v.name} {formatBRL(v.priceCents)} {v.isAvailable ? '' : '(indisp.)'}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </td>
                        <td className="nowrap">{p.variants.length ? 'por variante' : formatBRL(p.priceCents)}</td>
                        <td className="small">{p.optionGroupIds.map((id) => groups.get(id)?.name).filter(Boolean).join(', ') || '-'}</td>
                        <td>
                          <Button size="sm" variant={p.isAvailable ? 'success' : 'danger'} onClick={() => availability.mutate({ kind: 'products', id: p.id, isAvailable: !p.isAvailable })} aria-pressed={p.isAvailable}>
                            {p.isAvailable ? '✔ Disponível' : '✖ Indisponível'}
                          </Button>
                        </td>
                        <td className="nowrap">
                          {isAdmin ? (
                            <>
                              <Button size="sm" onClick={() => setEditingProduct(p)}>Editar</Button>{' '}
                              <Button size="sm" variant="ghost" onClick={() => archive.mutate({ kind: 'products', id: p.id, archived: !p.archivedAt })}>
                                {p.archivedAt ? 'Restaurar' : 'Arquivar'}
                              </Button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            );
          })}
        </div>
      ) : null}

      {tab === 'categories' ? (
        <Card>
          {data.categories.length === 0 ? <Empty icon="🗂️" title="Nenhuma categoria" /> : null}
          <table className="table">
            <tbody>
              {data.categories.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong> {c.archivedAt ? <span className="badge">arquivada</span> : null} {!c.isActive ? <span className="badge warning">inativa</span> : null}
                    <div className="small muted">{c.description}</div>
                  </td>
                  <td className="right">{isAdmin ? <Button size="sm" onClick={() => setEditingCategory(c)}>Editar</Button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {tab === 'groups' ? (
        <div className="stack">
          {data.optionGroups.length === 0 ? <Empty icon="🧂" title="Nenhum grupo de adicionais">Ex.: Sabores, Borda, Molhos, Ponto da carne.</Empty> : null}
          {data.optionGroups.map((g) => (
            <Card
              key={g.id}
              title={<>{g.name} {g.archivedAt ? <span className="badge">arquivado</span> : null}</>}
              actions={isAdmin ? <div className="row"><Button size="sm" onClick={() => setEditingGroup(g)}>Editar</Button><Button size="sm" variant="ghost" onClick={() => archive.mutate({ kind: 'option-groups', id: g.id, archived: !g.archivedAt })}>{g.archivedAt ? 'Restaurar' : 'Arquivar'}</Button></div> : undefined}
            >
              <p className="small muted">
                {g.minSelect > 0 ? `Obrigatório escolher ${g.minSelect}` : 'Opcional'} · máx. {g.maxSelect} · cobrança: {g.pricingMode === 'sum' ? 'soma' : g.pricingMode === 'max' ? 'maior valor' : 'média'}
                {g.description ? ` · ${g.description}` : ''}
              </p>
              <div className="pill-list">
                {g.options.filter((o) => !o.archivedAt).map((o) => (
                  <button key={o.id} type="button" className={`badge ${o.isAvailable ? 'success' : 'danger'}`} onClick={() => availability.mutate({ kind: 'options', id: o.id, isAvailable: !o.isAvailable })} title="Alternar disponibilidade">
                    {o.name} {o.priceCents ? `+${formatBRL(o.priceCents)}` : ''} {o.isAvailable ? '' : '(indisp.)'}
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {editingProduct ? <ProductModal product={editingProduct === 'new' ? null : editingProduct} categories={data.categories} groups={data.optionGroups} products={data.products} onClose={() => { setEditingProduct(null); invalidate(); }} /> : null}
      {editingCategory ? <CategoryModal category={editingCategory === 'new' ? null : editingCategory} onClose={() => { setEditingCategory(null); invalidate(); }} /> : null}
      {editingGroup ? <GroupModal group={editingGroup === 'new' ? null : editingGroup} onClose={() => { setEditingGroup(null); invalidate(); }} /> : null}
    </>
  );
}

function CategoryModal({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const [form, setForm] = useState({ name: category?.name ?? '', description: category?.description ?? '', sortOrder: category?.sortOrder ?? 0, isActive: category?.isActive ?? true, archived: Boolean(category?.archivedAt) });
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => (category ? api.patch(`/api/catalog/categories/${category.id}`, form) : api.post('/api/catalog/categories', form)),
    onSuccess: () => { toast.success('Categoria salva'); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal title={category ? 'Editar categoria' : 'Nova categoria'} onClose={onClose} actions={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button></>}>
      <Field label="Nome" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Descrição"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label="Ordem"><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></Field>
      <Check label="Ativa" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
      {category ? <Check label="Arquivada" checked={form.archived} onChange={(e) => setForm({ ...form, archived: e.target.checked })} /> : null}
    </Modal>
  );
}

const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function ProductModal({ product, categories, groups, products, onClose }: { product: Product | null; categories: Category[]; groups: OptionGroup[]; products: Product[]; onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: product?.name ?? '',
    categoryId: product?.categoryId ?? '',
    description: product?.description ?? '',
    price: centsToInput(product?.priceCents ?? 0),
    kind: product?.kind ?? 'simple',
    isAvailable: product?.isAvailable ?? true,
    allowNotes: product?.allowNotes ?? true,
    notesHint: product?.notesHint ?? '',
    prepMinutes: product?.prepMinutes?.toString() ?? '',
    sortOrder: product?.sortOrder ?? 0,
    imageUrl: product?.imageUrl ?? '',
    variants: (product?.variants ?? []).filter((v) => !v.archivedAt).map((v) => ({ id: v.id, name: v.name, price: centsToInput(v.priceCents), isAvailable: v.isAvailable })),
    optionGroupIds: product?.optionGroupIds ?? [],
    comboItems: product?.comboItems ?? [],
    availabilityOn: Boolean(product?.availability),
    days: product?.availability?.days ?? [],
    start: product?.availability?.start ?? '',
    end: product?.availability?.end ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        categoryId: form.categoryId || null,
        description: form.description || null,
        priceCents: parseMoney(form.price),
        kind: form.kind,
        isAvailable: form.isAvailable,
        allowNotes: form.allowNotes,
        notesHint: form.notesHint || null,
        prepMinutes: form.prepMinutes ? Number(form.prepMinutes) : null,
        sortOrder: form.sortOrder,
        imageUrl: form.imageUrl || null,
        variants: form.variants.filter((v) => v.name.trim()).map((v, i) => ({ id: v.id, name: v.name, priceCents: parseMoney(v.price), isAvailable: v.isAvailable, sortOrder: i })),
        optionGroupIds: form.optionGroupIds,
        comboItems: form.kind === 'combo' ? form.comboItems : [],
        availability: form.availabilityOn ? { days: form.days.length ? form.days : undefined, start: form.start || undefined, end: form.end || undefined } : null,
      };
      return product ? api.put(`/api/catalog/products/${product.id}`, body) : api.post('/api/catalog/products', body);
    },
    onSuccess: () => { toast.success('Produto salvo'); onClose(); },
    onError: (e) => setError(errorMessage(e)),
  });
  const setVariant = (i: number, patch: Partial<(typeof form.variants)[number]>) => setForm({ ...form, variants: form.variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) });
  return (
    <Modal title={product ? `Editar: ${product.name}` : 'Novo produto'} onClose={onClose} wide actions={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button></>}>
      {error ? <Alert kind="danger">{error}</Alert> : null}
      <div className="inline-fields">
        <Field label="Nome" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Categoria">
          <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">Sem categoria</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Tipo">
          <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'simple' | 'combo' })}>
            <option value="simple">Produto</option>
            <option value="combo">Combo</option>
          </Select>
        </Field>
        <Field label={form.variants.length ? 'Preço base (ignorado com variantes)' : 'Preço (R$)'} required>
          <Input inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </Field>
        <Field label="Tempo de preparo (min)"><Input type="number" value={form.prepMinutes} onChange={(e) => setForm({ ...form, prepMinutes: e.target.value })} /></Field>
        <Field label="Ordem"><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Descrição"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <Field label="Imagem (URL opcional)"><Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} /></Field>
      <Check label="Disponível" checked={form.isAvailable} onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })} />
      <Check label="Aceita observações do cliente" checked={form.allowNotes} onChange={(e) => setForm({ ...form, allowNotes: e.target.checked })} />
      {form.allowNotes ? <Field label="Dica de observação" hint="ex.: sem cebola, bem assada"><Input value={form.notesHint} onChange={(e) => setForm({ ...form, notesHint: e.target.value })} /></Field> : null}

      <h3>Tamanhos / variantes</h3>
      {form.variants.map((v, i) => (
        <div key={v.id ?? i} className="row">
          <Input placeholder="Nome (ex.: Grande)" value={v.name} onChange={(e) => setVariant(i, { name: e.target.value })} style={{ flex: 2 }} />
          <Input inputMode="decimal" placeholder="Preço" value={v.price} onChange={(e) => setVariant(i, { price: e.target.value })} style={{ flex: 1 }} />
          <Check label="disp." checked={v.isAvailable} onChange={(e) => setVariant(i, { isAvailable: e.target.checked })} />
          <Button size="sm" onClick={() => setForm({ ...form, variants: form.variants.filter((_, idx) => idx !== i) })} aria-label="Remover variante">🗑️</Button>
        </div>
      ))}
      <Button size="sm" onClick={() => setForm({ ...form, variants: [...form.variants, { id: undefined, name: '', price: '', isAvailable: true }] })}>➕ Variante</Button>

      <h3 style={{ marginTop: '1rem' }}>Grupos de adicionais</h3>
      {groups.filter((g) => !g.archivedAt).length === 0 ? <p className="muted small">Nenhum grupo cadastrado (aba Adicionais).</p> : null}
      <div className="pill-list">
        {groups.filter((g) => !g.archivedAt).map((g) => (
          <Check key={g.id} label={`${g.name} (${g.minSelect}-${g.maxSelect})`} checked={form.optionGroupIds.includes(g.id)} onChange={(e) => setForm({ ...form, optionGroupIds: e.target.checked ? [...form.optionGroupIds, g.id] : form.optionGroupIds.filter((x) => x !== g.id) })} />
        ))}
      </div>

      {form.kind === 'combo' ? (
        <>
          <h3 style={{ marginTop: '1rem' }}>Itens do combo</h3>
          {form.comboItems.map((ci, i) => (
            <div key={i} className="row">
              <Select value={ci.productId} onChange={(e) => setForm({ ...form, comboItems: form.comboItems.map((x, idx) => (idx === i ? { ...x, productId: e.target.value } : x)) })} style={{ flex: 2 }}>
                <option value="">Selecione…</option>
                {products.filter((p) => p.kind === 'simple' && !p.archivedAt && p.id !== product?.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Input type="number" min={1} value={ci.quantity} onChange={(e) => setForm({ ...form, comboItems: form.comboItems.map((x, idx) => (idx === i ? { ...x, quantity: Number(e.target.value) || 1 } : x)) })} style={{ width: 90 }} />
              <Button size="sm" onClick={() => setForm({ ...form, comboItems: form.comboItems.filter((_, idx) => idx !== i) })}>🗑️</Button>
            </div>
          ))}
          <Button size="sm" onClick={() => setForm({ ...form, comboItems: [...form.comboItems, { productId: '', quantity: 1 }] })}>➕ Item do combo</Button>
        </>
      ) : null}

      <h3 style={{ marginTop: '1rem' }}>Disponibilidade por horário (opcional)</h3>
      <Check label="Limitar a dias/horários" checked={form.availabilityOn} onChange={(e) => setForm({ ...form, availabilityOn: e.target.checked })} />
      {form.availabilityOn ? (
        <>
          <div className="pill-list">
            {WEEKDAYS.map((d) => (
              <Check key={d} label={WEEKDAY_LABEL[d]} checked={form.days.includes(d)} onChange={(e) => setForm({ ...form, days: e.target.checked ? [...form.days, d] : form.days.filter((x) => x !== d) })} />
            ))}
          </div>
          <div className="inline-fields">
            <Field label="Início"><Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
            <Field label="Fim"><Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
          </div>
        </>
      ) : null}
    </Modal>
  );
}

function GroupModal({ group, onClose }: { group: OptionGroup | null; onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: group?.name ?? '',
    description: group?.description ?? '',
    minSelect: group?.minSelect ?? 0,
    maxSelect: group?.maxSelect ?? 1,
    pricingMode: group?.pricingMode ?? 'sum',
    options: (group?.options ?? []).filter((o) => !o.archivedAt).map((o) => ({ id: o.id, name: o.name, price: centsToInput(o.priceCents), isAvailable: o.isAvailable, maxQuantity: o.maxQuantity })),
  });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, description: form.description || null, options: form.options.filter((o) => o.name.trim()).map((o, i) => ({ id: o.id, name: o.name, priceCents: parseMoney(o.price), isAvailable: o.isAvailable, maxQuantity: o.maxQuantity, sortOrder: i })) };
      return group ? api.put(`/api/catalog/option-groups/${group.id}`, body) : api.post('/api/catalog/option-groups', body);
    },
    onSuccess: () => { toast.success('Grupo salvo'); onClose(); },
    onError: (e) => setError(errorMessage(e)),
  });
  const setOpt = (i: number, patch: Partial<(typeof form.options)[number]>) => setForm({ ...form, options: form.options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) });
  return (
    <Modal title={group ? `Editar: ${group.name}` : 'Novo grupo de adicionais'} onClose={onClose} wide actions={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={() => save.mutate()} loading={save.isPending}>Salvar</Button></>}>
      {error ? <Alert kind="danger">{error}</Alert> : null}
      <div className="inline-fields">
        <Field label="Nome" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex.: Sabores, Borda, Molhos" /></Field>
        <Field label="Mínimo"><Input type="number" min={0} value={form.minSelect} onChange={(e) => setForm({ ...form, minSelect: Number(e.target.value) })} /></Field>
        <Field label="Máximo"><Input type="number" min={1} value={form.maxSelect} onChange={(e) => setForm({ ...form, maxSelect: Number(e.target.value) })} /></Field>
        <Field label="Cobrança" hint="'Maior valor' serve para pizza meio a meio">
          <Select value={form.pricingMode} onChange={(e) => setForm({ ...form, pricingMode: e.target.value as 'sum' | 'max' | 'average' })}>
            <option value="sum">Soma dos selecionados</option>
            <option value="max">Maior valor entre os selecionados</option>
            <option value="average">Média dos selecionados</option>
          </Select>
        </Field>
      </div>
      <Field label="Descrição"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <h3>Opções</h3>
      {form.options.map((o, i) => (
        <div key={o.id ?? i} className="row">
          <Input placeholder="Nome" value={o.name} onChange={(e) => setOpt(i, { name: e.target.value })} style={{ flex: 2 }} />
          <Input inputMode="decimal" placeholder="Preço (0 = grátis)" value={o.price} onChange={(e) => setOpt(i, { price: e.target.value })} style={{ flex: 1 }} />
          <Input type="number" min={1} title="Quantidade máxima por item" value={o.maxQuantity} onChange={(e) => setOpt(i, { maxQuantity: Number(e.target.value) || 1 })} style={{ width: 80 }} />
          <Check label="disp." checked={o.isAvailable} onChange={(e) => setOpt(i, { isAvailable: e.target.checked })} />
          <Button size="sm" onClick={() => setForm({ ...form, options: form.options.filter((_, idx) => idx !== i) })} aria-label="Remover opção">🗑️</Button>
        </div>
      ))}
      <Button size="sm" onClick={() => setForm({ ...form, options: [...form.options, { id: undefined, name: '', price: '', isAvailable: true, maxQuantity: 1 }] })}>➕ Opção</Button>
    </Modal>
  );
}
