import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Business, BusinessCategory, BusinessSettings, ChecklistItem, DeliveryZone, OpeningPeriod, OrderStatus, Profile, Weekday } from '../api/types';
import { centsToInput, formatBRL, parseMoney } from '../lib/format';
import { CATEGORY_LABEL, ORDER_STATUSES, ORDER_STATUS_LABEL, WEEKDAY_LABEL } from '../lib/labels';
import { useAuth } from '../state/auth';
import { useToast } from './Toast';
import { Alert, Button, Card, Check, Field, Input, Select, Spinner, Textarea } from './ui';

type SectionProps = { business: Business; onDone?: () => void };

function useSaveBusiness(onDone?: () => void) {
  const { refresh } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<{ business: Business }>('/api/business', body),
    onSuccess: async () => {
      toast.success('Configurações salvas');
      await refresh();
      void qc.invalidateQueries({ queryKey: ['review'] });
      onDone?.();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

function SaveBar({ loading, onSave, onDone }: { loading: boolean; onSave: () => void; onDone?: () => void }) {
  return (
    <div className="row" style={{ marginTop: '1rem' }}>
      <Button variant="primary" onClick={onSave} loading={loading}>
        Salvar{onDone ? ' e continuar' : ''}
      </Button>
    </div>
  );
}

// ---------------- Estabelecimento ----------------
export function BusinessInfoSection({ business, onDone }: SectionProps) {
  const save = useSaveBusiness(onDone);
  const [form, setForm] = useState({ name: business.name, category: business.category, phone: business.phone ?? '', contactEmail: business.contactEmail ?? '', timezone: business.timezone, address: { ...business.settings.address } });
  return (
    <Card title="Estabelecimento">
      <div className="inline-fields">
        <Field label="Nome fantasia" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Categoria">
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as BusinessCategory })}>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Telefone/contato"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="E-mail de contato"><Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></Field>
        <Field label="Fuso horário" hint="Ex.: America/Sao_Paulo"><Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></Field>
      </div>
      <h3>Endereço</h3>
      <div className="inline-fields">
        <Field label="Rua"><Input value={form.address.street} onChange={(e) => setForm({ ...form, address: { ...form.address, street: e.target.value } })} /></Field>
        <Field label="Número"><Input value={form.address.number} onChange={(e) => setForm({ ...form, address: { ...form.address, number: e.target.value } })} /></Field>
        <Field label="Complemento"><Input value={form.address.complement} onChange={(e) => setForm({ ...form, address: { ...form.address, complement: e.target.value } })} /></Field>
        <Field label="Bairro"><Input value={form.address.neighborhood} onChange={(e) => setForm({ ...form, address: { ...form.address, neighborhood: e.target.value } })} /></Field>
        <Field label="Cidade"><Input value={form.address.city} onChange={(e) => setForm({ ...form, address: { ...form.address, city: e.target.value } })} /></Field>
        <Field label="UF"><Input maxLength={2} value={form.address.state} onChange={(e) => setForm({ ...form, address: { ...form.address, state: e.target.value.toUpperCase() } })} /></Field>
        <Field label="CEP"><Input value={form.address.zip} onChange={(e) => setForm({ ...form, address: { ...form.address, zip: e.target.value } })} /></Field>
        <Field label="Referência"><Input value={form.address.reference} onChange={(e) => setForm({ ...form, address: { ...form.address, reference: e.target.value } })} /></Field>
      </div>
      <SaveBar loading={save.isPending} onDone={onDone} onSave={() => save.mutate({ name: form.name, category: form.category, phone: form.phone || null, contactEmail: form.contactEmail || null, timezone: form.timezone, settings: { address: form.address } })} />
    </Card>
  );
}

// ---------------- Perfil ----------------
export function ProfileSection({ business, profiles, onDone }: SectionProps & { profiles: Profile[] }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [category, setCategory] = useState<BusinessCategory>(business.category);
  const [result, setResult] = useState<{ createdCategories: number; createdGroups: number; reviewNotes: string[] } | null>(null);
  const profile = profiles.find((p) => p.category === category);
  const apply = useMutation({
    mutationFn: () => api.post<{ createdCategories: number; createdGroups: number; reviewNotes: string[] }>('/api/business/apply-profile', { category }),
    onSuccess: async (r) => {
      setResult(r);
      toast.success('Modelo aplicado. Revise nomes, preços e disponibilidade no Catálogo.');
      await refresh();
      void qc.invalidateQueries({ queryKey: ['catalog'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card title="Perfil do negócio (modelo inicial)">
      <Alert kind="info">Os perfis são apenas modelos de formulário e vocabulário. Eles <strong>não</strong> cadastram preços nem produtos reais: opções pagas entram com preço zero e indisponíveis até você revisar.</Alert>
      <div className="inline-fields">
        <Field label="Categoria">
          <Select value={category} onChange={(e) => setCategory(e.target.value as BusinessCategory)}>
            {profiles.map((p) => <option key={p.category} value={p.category}>{p.label}</option>)}
          </Select>
        </Field>
      </div>
      {profile ? (
        <div className="stack">
          <p>{profile.description}</p>
          <p className="small"><strong>Categorias sugeridas:</strong> {profile.categories.join(', ') || 'nenhuma'}</p>
          <p className="small"><strong>Variantes sugeridas:</strong> {profile.suggestedVariants.join(', ') || 'nenhuma'}</p>
          <p className="small"><strong>Grupos de adicionais:</strong> {profile.optionGroups.map((g) => `${g.name} (${g.minSelect}-${g.maxSelect})`).join('; ') || 'nenhum'}</p>
          <p className="small"><strong>Modalidades padrão:</strong> {[profile.fulfillment.delivery && 'entrega', profile.fulfillment.pickup && 'retirada', profile.fulfillment.dineIn && 'consumo no local', profile.fulfillment.reservations && 'reservas'].filter(Boolean).join(', ')}</p>
        </div>
      ) : null}
      {result ? <Alert kind="success">Criadas {result.createdCategories} categoria(s) e {result.createdGroups} grupo(s). {result.reviewNotes.join(' ')}</Alert> : null}
      <div className="row" style={{ marginTop: '1rem' }}>
        <Button variant="primary" onClick={() => apply.mutate()} loading={apply.isPending}>Aplicar modelo de {CATEGORY_LABEL[category]}</Button>
        {onDone ? <Button onClick={onDone}>Continuar</Button> : null}
      </div>
    </Card>
  );
}

// ---------------- Horários ----------------
const DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export function HoursSection({ business, onDone }: SectionProps) {
  const save = useSaveBusiness(onDone);
  const [hours, setHours] = useState<Record<Weekday, OpeningPeriod[]>>(() => structuredClone(business.settings.openingHours));
  const [closed, setClosed] = useState<string[]>(business.settings.closedDates);
  const [newDate, setNewDate] = useState('');
  const setDay = (d: Weekday, periods: OpeningPeriod[]) => setHours({ ...hours, [d]: periods });
  return (
    <Card title="Horários de funcionamento">
      <p className="small muted">Períodos que atravessam a meia-noite são aceitos (ex.: 18:00 às 02:00). 00:00 às 00:00 = 24 horas.</p>
      <table className="table">
        <tbody>
          {DAYS.map((d) => (
            <tr key={d}>
              <td style={{ width: 110 }}><strong>{WEEKDAY_LABEL[d]}</strong></td>
              <td>
                {hours[d].length === 0 ? <span className="muted">Fechado</span> : null}
                {hours[d].map((p, i) => (
                  <div key={i} className="row" style={{ marginBottom: 4 }}>
                    <Input type="time" value={p.open} onChange={(e) => setDay(d, hours[d].map((x, idx) => (idx === i ? { ...x, open: e.target.value } : x)))} style={{ width: 130 }} aria-label={`${WEEKDAY_LABEL[d]} abertura`} />
                    <span>às</span>
                    <Input type="time" value={p.close} onChange={(e) => setDay(d, hours[d].map((x, idx) => (idx === i ? { ...x, close: e.target.value } : x)))} style={{ width: 130 }} aria-label={`${WEEKDAY_LABEL[d]} fechamento`} />
                    <Button size="sm" onClick={() => setDay(d, hours[d].filter((_, idx) => idx !== i))} aria-label="Remover período">🗑️</Button>
                  </div>
                ))}
              </td>
              <td className="nowrap">
                <Button size="sm" onClick={() => setDay(d, [...hours[d], { open: '18:00', close: '23:00' }])}>➕ Período</Button>{' '}
                {hours[d].length ? <Button size="sm" variant="ghost" onClick={() => { const copy = { ...hours }; for (const x of DAYS) copy[x] = structuredClone(hours[d]); setHours(copy); }}>Copiar p/ todos</Button> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Dias fechados (feriados, férias)</h3>
      <div className="row">
        <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={{ width: 190 }} aria-label="Nova data fechada" />
        <Button size="sm" onClick={() => { if (newDate && !closed.includes(newDate)) setClosed([...closed, newDate].sort()); setNewDate(''); }}>Adicionar</Button>
      </div>
      <div className="pill-list" style={{ marginTop: 6 }}>
        {closed.map((d) => (
          <button key={d} type="button" className="badge" onClick={() => setClosed(closed.filter((x) => x !== d))} title="Remover">{d} ✕</button>
        ))}
      </div>
      <SaveBar loading={save.isPending} onDone={onDone} onSave={() => save.mutate({ settings: { openingHours: hours, closedDates: closed } })} />
    </Card>
  );
}

// ---------------- Modalidades e taxas ----------------
export function FulfillmentSection({ business, onDone }: SectionProps) {
  const save = useSaveBusiness(onDone);
  const toast = useToast();
  const qc = useQueryClient();
  const s = business.settings;
  const [form, setForm] = useState({ ...s.fulfillment, minOrder: centsToInput(s.minOrderCents), prep: String(s.defaultPrepMinutes), extra: String(s.deliveryExtraMinutes) });
  const zones = useQuery({ queryKey: ['zones'], queryFn: () => api.get<{ zones: DeliveryZone[] }>('/api/delivery-zones').then((r) => r.zones) });
  const [newZone, setNewZone] = useState({ name: '', fee: '', min: '', minutes: '' });
  const [editing, setEditing] = useState<Record<string, { name: string; fee: string; min: string; minutes: string }>>({});
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['zones'] });
  const create = useMutation({
    mutationFn: () => api.post('/api/delivery-zones', { name: newZone.name, feeCents: parseMoney(newZone.fee), minOrderCents: parseMoney(newZone.min), estimatedMinutes: newZone.minutes ? Number(newZone.minutes) : null }),
    onSuccess: () => { setNewZone({ name: '', fee: '', min: '', minutes: '' }); invalidate(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const update = useMutation({
    mutationFn: (p: { id: string; body: Record<string, unknown> }) => api.patch(`/api/delivery-zones/${p.id}`, p.body),
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/api/delivery-zones/${id}`), onSuccess: invalidate, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <Card title="Modalidades, taxas e tempos">
      <div className="row">
        <Check label="Entrega" checked={form.delivery} onChange={(e) => setForm({ ...form, delivery: e.target.checked })} />
        <Check label="Retirada" checked={form.pickup} onChange={(e) => setForm({ ...form, pickup: e.target.checked })} />
        <Check label="Consumo no local" checked={form.dineIn} onChange={(e) => setForm({ ...form, dineIn: e.target.checked })} />
        <Check label="Aceita reservas" hint="Registradas como observação em pedidos no local" checked={form.reservations} onChange={(e) => setForm({ ...form, reservations: e.target.checked })} />
      </div>
      <div className="inline-fields" style={{ marginTop: '0.75rem' }}>
        <Field label="Pedido mínimo geral (R$)"><Input inputMode="decimal" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} /></Field>
        <Field label="Tempo de preparo padrão (min)"><Input type="number" value={form.prep} onChange={(e) => setForm({ ...form, prep: e.target.value })} /></Field>
        <Field label="Tempo adicional de entrega (min)"><Input type="number" value={form.extra} onChange={(e) => setForm({ ...form, extra: e.target.value })} /></Field>
      </div>
      <SaveBar loading={save.isPending} onDone={onDone} onSave={() => save.mutate({ settings: { fulfillment: { delivery: form.delivery, pickup: form.pickup, dineIn: form.dineIn, reservations: form.reservations }, minOrderCents: parseMoney(form.minOrder), defaultPrepMinutes: Number(form.prep) || 0, deliveryExtraMinutes: Number(form.extra) || 0 } })} />

      <h3 style={{ marginTop: '1.5rem' }}>Bairros / áreas de entrega</h3>
      <p className="small muted">A taxa e o pedido mínimo da área são aplicados no cálculo. Sem áreas cadastradas, a entrega não cobra taxa e a IA não promete entrega em bairro algum.</p>
      {zones.isLoading ? <Spinner /> : null}
      <table className="table">
        <thead><tr><th>Área</th><th>Taxa</th><th>Pedido mínimo</th><th>Tempo (min)</th><th>Ativa</th><th /></tr></thead>
        <tbody>
          {(zones.data ?? []).map((z) => {
            const ed = editing[z.id];
            return (
              <tr key={z.id}>
                <td>{ed ? <Input value={ed.name} onChange={(e) => setEditing({ ...editing, [z.id]: { ...ed, name: e.target.value } })} /> : z.name}</td>
                <td>{ed ? <Input inputMode="decimal" value={ed.fee} onChange={(e) => setEditing({ ...editing, [z.id]: { ...ed, fee: e.target.value } })} /> : formatBRL(z.feeCents)}</td>
                <td>{ed ? <Input inputMode="decimal" value={ed.min} onChange={(e) => setEditing({ ...editing, [z.id]: { ...ed, min: e.target.value } })} /> : formatBRL(z.minOrderCents)}</td>
                <td>{ed ? <Input type="number" value={ed.minutes} onChange={(e) => setEditing({ ...editing, [z.id]: { ...ed, minutes: e.target.value } })} /> : z.estimatedMinutes ?? '-'}</td>
                <td><Check label="" checked={z.isActive} onChange={(e) => update.mutate({ id: z.id, body: { isActive: e.target.checked } })} aria-label={`Área ${z.name} ativa`} /></td>
                <td className="nowrap">
                  {ed ? (
                    <>
                      <Button size="sm" variant="primary" onClick={() => { update.mutate({ id: z.id, body: { name: ed.name, feeCents: parseMoney(ed.fee), minOrderCents: parseMoney(ed.min), estimatedMinutes: ed.minutes ? Number(ed.minutes) : null } }); const { [z.id]: _x, ...rest } = editing; setEditing(rest); }}>Salvar</Button>{' '}
                      <Button size="sm" onClick={() => { const { [z.id]: _x, ...rest } = editing; setEditing(rest); }}>Cancelar</Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => setEditing({ ...editing, [z.id]: { name: z.name, fee: centsToInput(z.feeCents), min: centsToInput(z.minOrderCents), minutes: z.estimatedMinutes?.toString() ?? '' } })}>Editar</Button>{' '}
                      <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Remover área "${z.name}"?`)) remove.mutate(z.id); }}>Remover</Button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          <tr>
            <td><Input placeholder="Nome do bairro/área" value={newZone.name} onChange={(e) => setNewZone({ ...newZone, name: e.target.value })} /></td>
            <td><Input inputMode="decimal" placeholder="Taxa" value={newZone.fee} onChange={(e) => setNewZone({ ...newZone, fee: e.target.value })} /></td>
            <td><Input inputMode="decimal" placeholder="Mínimo" value={newZone.min} onChange={(e) => setNewZone({ ...newZone, min: e.target.value })} /></td>
            <td><Input type="number" placeholder="min" value={newZone.minutes} onChange={(e) => setNewZone({ ...newZone, minutes: e.target.value })} /></td>
            <td />
            <td><Button size="sm" variant="primary" onClick={() => create.mutate()} disabled={!newZone.name.trim()} loading={create.isPending}>➕ Adicionar</Button></td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

// ---------------- Pagamentos e Pix ----------------
interface PixCheck { enabled: boolean; validation: { ok: boolean; errors: string[] }; samplePayload: string | null; note: string }
export function PaymentsSection({ business, onDone }: SectionProps) {
  const save = useSaveBusiness(onDone);
  const { isAdmin } = useAuth();
  const s = business.settings;
  const [methods, setMethods] = useState(s.paymentMethods.map((m) => ({ ...m })));
  const [pix, setPix] = useState({ ...s.pix });
  const [check, setCheck] = useState<PixCheck | null>(null);
  const verify = useMutation({ mutationFn: () => api.get<PixCheck>('/api/pix/config-check'), onSuccess: setCheck });
  useEffect(() => { setPix({ ...business.settings.pix }); }, [business.settings.pix]);
  return (
    <Card title="Formas de pagamento e Pix">
      <h3>Formas aceitas</h3>
      <p className="small muted">Cartão: o sistema apenas registra "cartão" como forma escolhida (maquininha na entrega/balcão). Nenhum dado de cartão é coletado ou armazenado.</p>
      {methods.map((m, i) => (
        <div key={m.id} className="row" style={{ marginBottom: 4 }}>
          <Check label="" checked={m.enabled} onChange={(e) => setMethods(methods.map((x, idx) => (idx === i ? { ...x, enabled: e.target.checked } : x)))} aria-label={`Aceitar ${m.label}`} />
          <Input value={m.label} onChange={(e) => setMethods(methods.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))} style={{ maxWidth: 360 }} aria-label={`Rótulo de ${m.id}`} />
          <span className="small muted">({m.id})</span>
        </div>
      ))}
      <h3 style={{ marginTop: '1rem' }}>QR Code Pix (opcional)</h3>
      <Alert kind="warning">Sem integração bancária, o QR é <strong>estático</strong>: identifica a cobrança, mas não confirma o pagamento. O pedido fica "aguardando confirmação do Pix" até uma pessoa conferir e marcar como pago. Não pedimos senhas nem credenciais bancárias.</Alert>
      <Check label="Habilitar QR Pix nos pedidos" checked={pix.enabled} onChange={(e) => setPix({ ...pix, enabled: e.target.checked })} />
      <div className="inline-fields">
        <Field label="Tipo da chave">
          <Select value={pix.keyType ?? ''} onChange={(e) => setPix({ ...pix, keyType: (e.target.value || null) as typeof pix.keyType })}>
            <option value="">Selecione…</option>
            <option value="cpf">CPF</option>
            <option value="cnpj">CNPJ</option>
            <option value="email">E-mail</option>
            <option value="phone">Telefone</option>
            <option value="evp">Chave aleatória</option>
          </Select>
        </Field>
        <Field label="Chave Pix" hint={business.pixKeyMasked ? 'Exibida mascarada para seu perfil' : undefined}>
          <Input value={pix.key} onChange={(e) => setPix({ ...pix, key: e.target.value })} disabled={!isAdmin} />
        </Field>
        <Field label="Nome do recebedor" hint="Até 25 caracteres, sem acentos"><Input maxLength={25} value={pix.receiverName} onChange={(e) => setPix({ ...pix, receiverName: e.target.value })} /></Field>
        <Field label="Cidade do recebedor" hint="Até 15 caracteres, sem acentos"><Input maxLength={15} value={pix.city} onChange={(e) => setPix({ ...pix, city: e.target.value })} /></Field>
      </div>
      <Check label="Incluir o valor do pedido no QR" checked={pix.includeAmount} onChange={(e) => setPix({ ...pix, includeAmount: e.target.checked })} />
      <Field label="Instruções exibidas junto ao QR"><Textarea rows={2} value={pix.instructions} onChange={(e) => setPix({ ...pix, instructions: e.target.value })} placeholder="ex.: Envie o comprovante por aqui após pagar." /></Field>
      {check ? (
        <Alert kind={check.validation.ok ? 'success' : 'danger'}>
          {check.validation.ok ? 'Configuração válida. Exemplo de payload (sem valor):' : check.validation.errors.join(' ')}
          {check.samplePayload ? <pre className="mono small pre">{check.samplePayload}</pre> : null}
          <div className="small">{check.note}</div>
        </Alert>
      ) : null}
      <div className="row" style={{ marginTop: '1rem' }}>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ settings: { paymentMethods: methods, pix: business.pixKeyMasked && !isAdmin ? { ...pix, key: undefined } : pix } })}>Salvar{onDone ? ' e continuar' : ''}</Button>
        {isAdmin ? <Button onClick={() => verify.mutate()} loading={verify.isPending}>Verificar configuração Pix salva</Button> : null}
      </div>
    </Card>
  );
}

// ---------------- Impressora ----------------
export function PrinterSection({ business, onDone }: SectionProps) {
  const save = useSaveBusiness(onDone);
  const [p, setP] = useState({ ...business.settings.printer });
  return (
    <Card title="Impressora térmica e preferências">
      <div className="inline-fields">
        <Field label="Modo de impressão" hint="Navegador: funciona sem driver especial, usando a impressora padrão do sistema. ESC/POS: envia direto para impressora de rede (IP:9100).">
          <Select value={p.provider} onChange={(e) => setP({ ...p, provider: e.target.value as 'browser' | 'escpos_network' })}>
            <option value="browser">Pelo navegador (recomendado para começar)</option>
            <option value="escpos_network">ESC/POS por rede (TCP 9100)</option>
          </Select>
        </Field>
        <Field label="Largura do papel">
          <Select value={String(p.paperWidthMm)} onChange={(e) => setP({ ...p, paperWidthMm: Number(e.target.value) as 80 | 58 })}>
            <option value="80">80 mm (48 colunas)</option>
            <option value="58">58 mm (32 colunas)</option>
          </Select>
        </Field>
        <Field label="Vias por impressão"><Input type="number" min={1} max={5} value={p.copies} onChange={(e) => setP({ ...p, copies: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
      </div>
      {p.provider === 'escpos_network' ? (
        <div className="inline-fields">
          <Field label="IP/host da impressora" required><Input value={p.host} onChange={(e) => setP({ ...p, host: e.target.value })} placeholder="192.168.0.50" /></Field>
          <Field label="Porta"><Input type="number" value={p.port} onChange={(e) => setP({ ...p, port: Number(e.target.value) || 9100 })} /></Field>
          <Field label="Codificação de texto" hint="CP1252 mantém acentos na maioria das impressoras; ASCII remove acentos">
            <Select value={p.encoding} onChange={(e) => setP({ ...p, encoding: e.target.value as 'cp1252' | 'ascii' })}>
              <option value="cp1252">CP1252 (com acentos)</option>
              <option value="ascii">ASCII (sem acentos)</option>
            </Select>
          </Field>
          <Field label="Comando de tabela de caracteres (ESC t n)" hint="16 = WPC1252 em Epson/compatíveis. Vazio = não enviar.">
            <Input type="number" value={p.codepageCommand ?? ''} onChange={(e) => setP({ ...p, codepageCommand: e.target.value === '' ? null : Number(e.target.value) })} />
          </Field>
          <Check label="Cortar papel ao final (se suportado)" checked={p.cut} onChange={(e) => setP({ ...p, cut: e.target.checked })} />
          <Check label="Imprimir automaticamente ao criar pedido" checked={p.autoPrintOnCreate} onChange={(e) => setP({ ...p, autoPrintOnCreate: e.target.checked })} />
        </div>
      ) : null}
      <div className="inline-fields">
        <Field label="Texto do cabeçalho (opcional)"><Input value={p.headerText} onChange={(e) => setP({ ...p, headerText: e.target.value })} /></Field>
        <Field label="Texto do rodapé"><Input value={p.footerText} onChange={(e) => setP({ ...p, footerText: e.target.value })} /></Field>
      </div>
      <p className="small muted">O comprovante é interno (controle de pedido) e nunca é rotulado como documento fiscal.</p>
      <SaveBar loading={save.isPending} onDone={onDone} onSave={() => save.mutate({ settings: { printer: p } })} />
    </Card>
  );
}

// ---------------- Mensagens e atendimento ----------------
export function MessagesSection({ business, onDone }: SectionProps) {
  const save = useSaveBusiness(onDone);
  const s = business.settings;
  const [m, setM] = useState({ ...s.messages, statusTemplates: { ...s.messages.statusTemplates } });
  const [h, setH] = useState({ ...s.handoff, keywordsText: s.handoff.keywords.join(', ') });
  const [n, setN] = useState({ ...s.notifications });
  const field = (key: keyof Omit<BusinessSettings['messages'], 'statusTemplates'>, label: string, hint?: string) => (
    <Field key={key} label={label} hint={hint}><Textarea rows={2} value={m[key]} onChange={(e) => setM({ ...m, [key]: e.target.value })} /></Field>
  );
  return (
    <Card title="Mensagens padrão, privacidade e transferência">
      <h3>Mensagens ao cliente</h3>
      {field('greeting', 'Saudação')}
      {field('closed', 'Fora do horário')}
      {field('privacyNotice', 'Aviso de privacidade', 'Enviado uma vez por conversa junto da primeira resposta automática.')}
      {field('awaitingConfirmation', 'Pedido de confirmação (após o resumo)')}
      {field('orderConfirmed', 'Pedido registrado', 'Use {numero} para o número do pedido.')}
      {field('handoff', 'Transferência para pessoa')}
      {field('aiUnavailable', 'IA indisponível / modo manual')}
      <h3>Notificações de status</h3>
      <Check label="Enviar mensagem ao cliente quando a equipe mudar o status" hint="Só funciona em conversas de canal integrado ou simulador; nunca envia sem mudança explícita feita por uma pessoa." checked={n.enabled} onChange={(e) => setN({ ...n, enabled: e.target.checked })} />
      <div className="pill-list">
        {ORDER_STATUSES.filter((st) => st !== 'recebido').map((st: OrderStatus) => (
          <Check key={st} label={ORDER_STATUS_LABEL[st]} checked={n.statuses.includes(st)} onChange={(e) => setN({ ...n, statuses: e.target.checked ? [...n.statuses, st] : n.statuses.filter((x) => x !== st) })} />
        ))}
      </div>
      {ORDER_STATUSES.filter((st) => st !== 'recebido').map((st) => (
        <Field key={st} label={`Modelo: ${ORDER_STATUS_LABEL[st]}`}><Input value={m.statusTemplates[st] ?? ''} onChange={(e) => setM({ ...m, statusTemplates: { ...m.statusTemplates, [st]: e.target.value } })} /></Field>
      ))}
      <h3>Transferência para atendimento humano</h3>
      <Field label="Política (orienta a IA)"><Textarea rows={3} value={h.policy} onChange={(e) => setH({ ...h, policy: e.target.value })} /></Field>
      <Field label="Palavras-chave que transferem imediatamente (separadas por vírgula)"><Input value={h.keywordsText} onChange={(e) => setH({ ...h, keywordsText: e.target.value })} /></Field>
      <Field label="Confiança mínima da IA (0 a 1)" hint="Abaixo disso a conversa é transferida para uma pessoa"><Input type="number" step={0.05} min={0} max={1} value={h.confidenceThreshold} onChange={(e) => setH({ ...h, confidenceThreshold: Number(e.target.value) })} /></Field>
      <SaveBar loading={save.isPending} onDone={onDone} onSave={() => save.mutate({ settings: { messages: m, notifications: n, handoff: { policy: h.policy, keywords: h.keywordsText.split(',').map((k) => k.trim()).filter(Boolean), confidenceThreshold: h.confidenceThreshold } } })} />
    </Card>
  );
}

// ---------------- Canais ----------------
interface MessagingStatus {
  channels: { channel: string; provider: string; configured: boolean; connected: boolean; sendEnabled: boolean; enabledForBusiness: boolean; details: Record<string, unknown> }[];
  webhooksEnabled: boolean;
  whatsappProvider: string;
  bridgeConfigured: boolean;
  sendEnabled: boolean;
}
export function ChannelsSection({ business, onDone }: SectionProps) {
  const save = useSaveBusiness(onDone);
  const [c, setC] = useState({ ...business.settings.channels });
  const status = useQuery({ queryKey: ['messaging-status'], queryFn: () => api.get<MessagingStatus>('/api/messaging/status'), refetchInterval: 15000 });
  const wa = status.data?.channels.find((x) => x.channel === 'whatsapp');
  return (
    <Card title="Canais de atendimento">
      <Check label="Simulador (testes sem envio real)" checked={c.simulator} onChange={(e) => setC({ ...c, simulator: e.target.checked })} />
      <Check label="WhatsApp via ponte open-wa (não oficial)" hint="Exige a ponte em execução (integrations/whatsapp-openwa) e WHATSAPP_PROVIDER=openwa no servidor. Veja docs/INTEGRACOES.md." checked={c.whatsapp} onChange={(e) => setC({ ...c, whatsapp: e.target.checked })} />
      <Alert kind="warning">O open-wa automatiza o WhatsApp Web e <strong>não é autorizado pela Meta</strong>: há risco de bloqueio do número e de parar quando o WhatsApp Web muda. Use um número dedicado ao negócio e mantenha o envio real desligado durante testes.</Alert>
      {status.data ? (
        <table className="table">
          <thead><tr><th>Canal</th><th>Provedor</th><th>Configurado</th><th>Conectado</th><th>Envio real</th><th>Detalhes</th></tr></thead>
          <tbody>
            {status.data.channels.map((ch) => (
              <tr key={ch.channel}>
                <td>{ch.channel}</td>
                <td>{ch.provider}</td>
                <td>{ch.configured ? '✔' : '✖'}</td>
                <td>{ch.connected ? '🟢 sim' : '🔴 não'}</td>
                <td>{ch.sendEnabled ? '⚠️ habilitado' : 'desligado'}</td>
                <td className="small muted">{Object.entries(ch.details).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</td>
              </tr>
            ))}
            {!wa ? <tr><td>whatsapp</td><td colSpan={5} className="muted">Não configurado no servidor (WHATSAPP_PROVIDER={status.data.whatsappProvider}).</td></tr> : null}
          </tbody>
        </table>
      ) : null}
      <p className="small muted">Webhooks assinados: {status.data?.webhooksEnabled ? 'habilitados' : 'desabilitados (WEBHOOK_SECRET vazio)'}. Ponte: {status.data?.bridgeConfigured ? 'token configurado' : 'sem token'}.</p>
      <SaveBar loading={save.isPending} onDone={onDone} onSave={() => save.mutate({ settings: { channels: c } })} />
    </Card>
  );
}

// ---------------- IA ----------------
interface AiStatus {
  health: { provider: string; reachable: boolean; modelAvailable: boolean; baseUrl: string | null; model: string | null; availableModels: string[]; error: string | null; checkedAt: string };
  settings: { enabled: boolean; baseUrl: string | null; model: string | null; temperature: number; maxCatalogItems: number; effectiveBaseUrl: string; effectiveModel: string; timeoutMs: number };
  dataReviewedAt: string | null;
  ready: boolean;
}
export function AiSection({ business, onDone }: SectionProps) {
  const save = useSaveBusiness(onDone);
  const toast = useToast();
  const { isAdmin } = useAuth();
  const s = business.settings.ai;
  const [form, setForm] = useState({ enabled: s.enabled, baseUrl: s.baseUrl ?? '', model: s.model ?? '', temperature: s.temperature, maxCatalogItems: s.maxCatalogItems });
  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => api.get<AiStatus>('/api/ai/status'), refetchInterval: 30000 });
  const [testMsg, setTestMsg] = useState('Olá! Vocês estão abertos? O que tem no cardápio?');
  const [testOut, setTestOut] = useState<unknown>(null);
  const test = useMutation({ mutationFn: () => api.post<{ output: unknown; contextChars: number }>('/api/ai/test', { message: testMsg }), onSuccess: (r) => setTestOut(r), onError: (e) => toast.error(errorMessage(e)) });
  const h = status.data?.health;
  return (
    <Card title="Agente de IA (Ollama local)">
      <Alert kind="info">A IA só sugere; preço, disponibilidade, endereço, pagamento e confirmação são decididos pelo servidor. Ela usa apenas dados aprovados do estabelecimento e nunca aprende sozinha com as conversas: correções viram sugestões para revisão humana.</Alert>
      {!business.dataReviewedAt ? <Alert kind="warning">Conclua a <strong>revisão de dados</strong> (aba Revisão) antes de ligar o atendimento automático.</Alert> : null}
      <Check label="Atendimento automático habilitado" checked={form.enabled} disabled={!business.dataReviewedAt} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
      <div className="inline-fields">
        <Field label="Endereço do Ollama" hint={`Vazio = usar .env (${status.data?.settings.effectiveBaseUrl ?? 'OLLAMA_BASE_URL'})`}><Input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="http://127.0.0.1:11434" /></Field>
        <Field label="Modelo" hint={`Vazio = usar .env (${status.data?.settings.effectiveModel ?? 'OLLAMA_MODEL'})`}><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="qwen2.5:7b" /></Field>
        <Field label="Temperatura (0 a 1)"><Input type="number" step={0.1} min={0} max={1} value={form.temperature} onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })} /></Field>
        <Field label="Máx. de produtos no contexto"><Input type="number" min={10} max={300} value={form.maxCatalogItems} onChange={(e) => setForm({ ...form, maxCatalogItems: Number(e.target.value) })} /></Field>
      </div>
      <SaveBar loading={save.isPending} onDone={onDone} onSave={() => save.mutate({ settings: { ai: { enabled: form.enabled, baseUrl: form.baseUrl || null, model: form.model || null, temperature: form.temperature, maxCatalogItems: form.maxCatalogItems } } })} />
      <h3 style={{ marginTop: '1.25rem' }}>Diagnóstico</h3>
      {status.isLoading ? <Spinner /> : null}
      {h ? (
        <table className="table">
          <tbody>
            <tr><td>Provedor</td><td>{h.provider}</td></tr>
            <tr><td>Endereço</td><td className="mono">{h.baseUrl}</td></tr>
            <tr><td>Ollama acessível</td><td>{h.reachable ? '🟢 sim' : '🔴 não'}</td></tr>
            <tr><td>Modelo "{h.model}" disponível</td><td>{h.modelAvailable ? '🟢 sim' : '🔴 não'}</td></tr>
            <tr><td>Modelos instalados</td><td className="small">{h.availableModels.join(', ') || '-'}</td></tr>
            <tr><td>Erro</td><td className="small" style={{ color: 'var(--danger)' }}>{h.error ?? '-'}</td></tr>
            <tr><td>Pronto para atender</td><td>{status.data?.ready ? '🟢 sim' : '🔴 não (precisa: Ollama acessível, modelo instalado, revisão concluída e IA habilitada)'}</td></tr>
          </tbody>
        </table>
      ) : null}
      <div className="row">
        <Button size="sm" onClick={() => void status.refetch()}>Verificar novamente</Button>
      </div>
      {isAdmin ? (
        <>
          <h3 style={{ marginTop: '1rem' }}>Teste rápido (não grava conversa)</h3>
          <div className="row">
            <Input value={testMsg} onChange={(e) => setTestMsg(e.target.value)} style={{ flex: 1, minWidth: 240 }} aria-label="Mensagem de teste" />
            <Button onClick={() => test.mutate()} loading={test.isPending}>Testar modelo</Button>
          </div>
          {testOut ? <pre className="mono small pre" style={{ maxHeight: 320, overflow: 'auto', background: 'var(--surface-2)', padding: 8 }}>{JSON.stringify(testOut, null, 2)}</pre> : null}
        </>
      ) : null}
    </Card>
  );
}

// ---------------- Revisão ----------------
export function ReviewSection({ business }: { business: Business }) {
  const { refresh, isAdmin } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['review'], queryFn: () => api.get<{ items: ChecklistItem[]; readyForAi: boolean; dataReviewedAt: string | null }>('/api/business/review') });
  const mark = useMutation({
    mutationFn: (reviewed: boolean) => api.post('/api/business/review', { reviewed }),
    onSuccess: async () => { toast.success('Revisão atualizada'); await refresh(); void qc.invalidateQueries({ queryKey: ['review'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Card title="Revisão de dados antes do atendimento automático">
      <p className="small muted">Confira cada item. O atendimento automático só pode ser ligado com os itens obrigatórios em dia e a revisão marcada como concluída.</p>
      {q.isLoading ? <Spinner /> : null}
      {q.data ? (
        <table className="table">
          <tbody>
            {q.data.items.map((i) => (
              <tr key={i.key}>
                <td style={{ width: 40 }}>{i.ok ? '✅' : i.required ? '❌' : '⚠️'}</td>
                <td>{i.label}{i.required ? '' : <span className="small muted"> (recomendado)</span>}</td>
                <td className="small muted">{i.ok ? '' : i.hint}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {q.data ? (
        <div className="row" style={{ marginTop: '0.75rem' }}>
          {business.dataReviewedAt ? (
            <>
              <span className="badge success">Revisão concluída</span>
              {isAdmin ? <Button size="sm" onClick={() => mark.mutate(false)}>Reabrir revisão</Button> : null}
            </>
          ) : isAdmin ? (
            <Button variant="primary" disabled={!q.data.readyForAi} onClick={() => mark.mutate(true)} loading={mark.isPending}>Marcar revisão como concluída</Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => void q.refetch()}>Atualizar</Button>
        </div>
      ) : null}
    </Card>
  );
}
