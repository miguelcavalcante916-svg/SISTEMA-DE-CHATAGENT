import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { Profile } from '../api/types';
import { AiSection, BusinessInfoSection, ChannelsSection, FulfillmentSection, HoursSection, MessagesSection, PaymentsSection, ProfileSection, ReviewSection } from '../components/SettingsSections';
import { Alert, PageHeader } from '../components/ui';
import { useAuth } from '../state/auth';

const TABS = [
  ['estabelecimento', 'Estabelecimento'],
  ['perfil', 'Perfil'],
  ['horarios', 'Horários'],
  ['modalidades', 'Modalidades e taxas'],
  ['pagamentos', 'Pagamentos e Pix'],
  ['mensagens', 'Mensagens'],
  ['canais', 'Canais'],
  ['ia', 'Agente de IA'],
  ['revisao', 'Revisão de dados'],
] as const;

export function SettingsPage() {
  const { business, isAdmin } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'estabelecimento';
  const profiles = useQuery({ queryKey: ['profiles'], queryFn: () => api.get<{ profiles: Profile[] }>('/api/business/profiles').then((r) => r.profiles) });
  if (!business) return null;
  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Configurações" />
        <Alert kind="warning">Somente administradores alteram configurações. Você pode consultar o status abaixo.</Alert>
        <ReviewSection business={business} />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Configurações" subtitle="Tudo que o atendimento e o cálculo de pedidos usam vem daqui." />
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setSp({ tab: k })}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'estabelecimento' ? <BusinessInfoSection key={business.id} business={business} /> : null}
      {tab === 'perfil' ? <ProfileSection business={business} profiles={profiles.data ?? []} /> : null}
      {tab === 'horarios' ? <HoursSection business={business} /> : null}
      {tab === 'modalidades' ? <FulfillmentSection business={business} /> : null}
      {tab === 'pagamentos' ? <PaymentsSection business={business} /> : null}
      {tab === 'mensagens' ? <MessagesSection business={business} /> : null}
      {tab === 'canais' ? <ChannelsSection business={business} /> : null}
      {tab === 'ia' ? <AiSection business={business} /> : null}
      {tab === 'revisao' ? <ReviewSection business={business} /> : null}
    </>
  );
}
