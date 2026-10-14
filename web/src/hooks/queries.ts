import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Catalog, Conversation, DeliveryZone, Order } from '../api/types';

export function useCatalog(includeArchived = false) {
  return useQuery({ queryKey: ['catalog', includeArchived], queryFn: () => api.get<Catalog>(`/api/catalog${includeArchived ? '?includeArchived=1' : ''}`) });
}
export function useZones() {
  return useQuery({ queryKey: ['zones'], queryFn: () => api.get<{ zones: DeliveryZone[] }>('/api/delivery-zones').then((r) => r.zones) });
}
export function useOrder(id: string | undefined, refetchInterval?: number) {
  return useQuery({ queryKey: ['order', id], queryFn: () => api.get<{ order: Order }>(`/api/orders/${id}`).then((r) => r.order), enabled: Boolean(id), refetchInterval });
}
export function useConversation(id: string | undefined, refetchInterval?: number) {
  return useQuery({ queryKey: ['conversation', id], queryFn: () => api.get<{ conversation: Conversation }>(`/api/conversations/${id}`).then((r) => r.conversation), enabled: Boolean(id), refetchInterval });
}
