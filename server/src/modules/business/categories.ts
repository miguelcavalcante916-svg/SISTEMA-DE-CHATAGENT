export const BUSINESS_CATEGORIES = [
  'pizzaria',
  'hamburgueria',
  'acaiteria',
  'sorveteria',
  'churrascaria',
  'bar',
  'outro',
] as const;
export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<BusinessCategory, string> = {
  pizzaria: 'Pizzaria',
  hamburgueria: 'Hamburgueria',
  acaiteria: 'Açaíteria',
  sorveteria: 'Sorveteria',
  churrascaria: 'Churrascaria',
  bar: 'Bar',
  outro: 'Outro',
};
