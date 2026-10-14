import type { BusinessCategory } from './categories.js';

/**
 * Perfis por categoria: modelos de formulário e vocabulário.
 * NÃO são fatos sobre o estabelecimento: preços, produtos e disponibilidade são cadastrados por ele.
 */
export interface ProfileOptionGroup {
  name: string;
  description?: string;
  minSelect: number;
  maxSelect: number;
  pricingMode: 'sum' | 'max' | 'average';
  /** quando true, opções são criadas indisponíveis com preço zero até revisão */
  paid: boolean;
  options: string[];
}

export interface BusinessProfile {
  category: BusinessCategory;
  label: string;
  description: string;
  vocabulary: { product: string; variant: string; options: string; notesHint: string };
  categories: string[];
  suggestedVariants: string[];
  optionGroups: ProfileOptionGroup[];
  fulfillment: { delivery: boolean; pickup: boolean; dineIn: boolean; reservations: boolean };
  reviewNotes: string[];
}

export const PROFILES: Record<BusinessCategory, BusinessProfile> = {
  pizzaria: {
    category: 'pizzaria',
    label: 'Pizzaria',
    description: 'Tamanhos, sabores, meio a meio, borda, adicionais, observações e tempo estimado.',
    vocabulary: { product: 'Pizza', variant: 'Tamanho', options: 'Sabores, borda e adicionais', notesHint: 'ex.: sem cebola, bem assada' },
    categories: ['Pizzas salgadas', 'Pizzas doces', 'Bebidas', 'Sobremesas'],
    suggestedVariants: ['Pequena', 'Média', 'Grande', 'Família'],
    optionGroups: [
      {
        name: 'Sabores (meio a meio)',
        description: 'Escolha de 1 a 2 sabores. Cobrança pelo sabor de maior valor.',
        minSelect: 1,
        maxSelect: 2,
        pricingMode: 'max',
        paid: true,
        options: [],
      },
      { name: 'Borda recheada', minSelect: 0, maxSelect: 1, pricingMode: 'sum', paid: true, options: ['Catupiry', 'Cheddar', 'Chocolate'] },
      { name: 'Adicionais', minSelect: 0, maxSelect: 5, pricingMode: 'sum', paid: true, options: ['Bacon', 'Queijo extra', 'Azeitona', 'Ovo'] },
    ],
    fulfillment: { delivery: true, pickup: true, dineIn: false, reservations: false },
    reviewNotes: ['Defina o tempo estimado de preparo e de entrega.', 'Cadastre os sabores como opções do grupo "Sabores" ou como produtos.'],
  },
  hamburgueria: {
    category: 'hamburgueria',
    label: 'Hamburgueria',
    description: 'Ponto da carne, complementos, combos, molhos e acompanhamentos.',
    vocabulary: { product: 'Lanche', variant: 'Tamanho', options: 'Ponto, molhos, adicionais', notesHint: 'ex.: sem tomate, maionese à parte' },
    categories: ['Hambúrgueres', 'Combos', 'Acompanhamentos', 'Bebidas', 'Sobremesas'],
    suggestedVariants: [],
    optionGroups: [
      { name: 'Ponto da carne', minSelect: 1, maxSelect: 1, pricingMode: 'sum', paid: false, options: ['Mal passado', 'Ao ponto', 'Bem passado'] },
      { name: 'Molhos', minSelect: 0, maxSelect: 3, pricingMode: 'sum', paid: false, options: ['Maionese da casa', 'Barbecue', 'Mostarda e mel'] },
      { name: 'Adicionais', minSelect: 0, maxSelect: 6, pricingMode: 'sum', paid: true, options: ['Bacon', 'Queijo extra', 'Ovo', 'Cebola caramelizada'] },
      { name: 'Acompanhamento do combo', minSelect: 1, maxSelect: 1, pricingMode: 'sum', paid: true, options: ['Batata frita', 'Onion rings'] },
    ],
    fulfillment: { delivery: true, pickup: true, dineIn: true, reservations: false },
    reviewNotes: ['Crie combos como produtos do tipo "combo" com os componentes.'],
  },
  acaiteria: {
    category: 'acaiteria',
    label: 'Açaíteria',
    description: 'Tamanhos, bases, complementos, adicionais e disponibilidade.',
    vocabulary: { product: 'Açaí', variant: 'Tamanho', options: 'Base, complementos, adicionais', notesHint: 'ex.: sem granola' },
    categories: ['Açaí', 'Bebidas', 'Extras'],
    suggestedVariants: ['300 ml', '500 ml', '700 ml', '1 litro'],
    optionGroups: [
      { name: 'Base', minSelect: 1, maxSelect: 1, pricingMode: 'sum', paid: false, options: ['Açaí tradicional', 'Açaí com banana', 'Açaí com morango'] },
      { name: 'Complementos (inclusos)', minSelect: 0, maxSelect: 5, pricingMode: 'sum', paid: false, options: ['Granola', 'Leite em pó', 'Banana', 'Leite condensado'] },
      { name: 'Adicionais pagos', minSelect: 0, maxSelect: 10, pricingMode: 'sum', paid: true, options: ['Morango', 'Nutella', 'Paçoca', 'Ovomaltine'] },
    ],
    fulfillment: { delivery: true, pickup: true, dineIn: true, reservations: false },
    reviewNotes: ['Marque como indisponível os complementos que acabarem no dia.'],
  },
  sorveteria: {
    category: 'sorveteria',
    label: 'Sorveteria',
    description: 'Sabores, tamanhos, coberturas, adicionais e disponibilidade.',
    vocabulary: { product: 'Sorvete', variant: 'Tamanho', options: 'Sabores, coberturas, adicionais', notesHint: 'ex.: casquinha separada' },
    categories: ['Sorvetes', 'Milkshakes', 'Picolés', 'Bebidas'],
    suggestedVariants: ['1 bola', '2 bolas', '3 bolas', 'Pote 500 ml', 'Pote 1 litro'],
    optionGroups: [
      { name: 'Sabores', minSelect: 1, maxSelect: 3, pricingMode: 'sum', paid: false, options: ['Chocolate', 'Morango', 'Creme', 'Flocos'] },
      { name: 'Coberturas', minSelect: 0, maxSelect: 2, pricingMode: 'sum', paid: true, options: ['Chocolate', 'Caramelo', 'Morango'] },
      { name: 'Adicionais', minSelect: 0, maxSelect: 5, pricingMode: 'sum', paid: true, options: ['Granulado', 'Castanha', 'Chantilly'] },
    ],
    fulfillment: { delivery: true, pickup: true, dineIn: true, reservations: false },
    reviewNotes: ['Informe a disponibilidade de sabores do dia.'],
  },
  churrascaria: {
    category: 'churrascaria',
    label: 'Churrascaria',
    description: 'Modalidade/itens, acompanhamentos, horários, reservas e entrega apenas se habilitada.',
    vocabulary: { product: 'Item', variant: 'Modalidade/porção', options: 'Acompanhamentos', notesHint: 'ex.: carne ao ponto' },
    categories: ['Rodízio', 'À la carte', 'Acompanhamentos', 'Bebidas', 'Sobremesas'],
    suggestedVariants: ['Meia porção', 'Porção inteira'],
    optionGroups: [
      { name: 'Ponto da carne', minSelect: 0, maxSelect: 1, pricingMode: 'sum', paid: false, options: ['Mal passada', 'Ao ponto', 'Bem passada'] },
      { name: 'Acompanhamentos', minSelect: 0, maxSelect: 4, pricingMode: 'sum', paid: true, options: ['Arroz', 'Farofa', 'Vinagrete', 'Mandioca frita'] },
    ],
    fulfillment: { delivery: false, pickup: true, dineIn: true, reservations: true },
    reviewNotes: ['Entrega fica desabilitada até você habilitar.', 'Reservas são registradas como pedido de consumo no local com observação.'],
  },
  bar: {
    category: 'bar',
    label: 'Bar',
    description: 'Bebidas, porções, disponibilidade, horários e reservas se oferecidas.',
    vocabulary: { product: 'Item', variant: 'Tamanho', options: 'Acompanhamentos', notesHint: 'ex.: sem gelo' },
    categories: ['Cervejas', 'Drinks', 'Porções', 'Sem álcool'],
    suggestedVariants: ['Meia porção', 'Porção inteira'],
    optionGroups: [
      { name: 'Acompanhamentos da porção', minSelect: 0, maxSelect: 3, pricingMode: 'sum', paid: true, options: ['Molho especial', 'Pão de alho'] },
    ],
    fulfillment: { delivery: false, pickup: true, dineIn: true, reservations: true },
    reviewNotes: ['Confira horários de funcionamento por dia da semana.'],
  },
  outro: {
    category: 'outro',
    label: 'Outro',
    description: 'Configuração livre.',
    vocabulary: { product: 'Produto', variant: 'Variante', options: 'Adicionais', notesHint: '' },
    categories: [],
    suggestedVariants: [],
    optionGroups: [],
    fulfillment: { delivery: true, pickup: true, dineIn: false, reservations: false },
    reviewNotes: [],
  },
};
