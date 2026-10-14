import type { TestContext } from './helpers.js';

export interface PizzaFixture {
  categoryId: string;
  pizzaId: string;
  mediaId: string;
  grandeId: string;
  refriId: string;
  saboresGroupId: string;
  mussarelaId: string;
  calabresaId: string;
  portuguesaId: string;
  bordaGroupId: string;
  catupiryId: string;
  adicionaisGroupId: string;
  baconId: string;
  zoneId: string;
}

/** Catálogo de teste (dados fictícios) para uma pizzaria. */
export async function seedPizzaCatalog(ctx: TestContext): Promise<PizzaFixture> {
  const cat = await ctx.admin({ method: 'POST', url: '/api/catalog/categories', payload: { name: 'Pizzas' } });
  if (cat.statusCode !== 201) throw new Error(cat.body);
  const categoryId = cat.json().category.id as string;

  const sabores = await ctx.admin({
    method: 'POST',
    url: '/api/catalog/option-groups',
    payload: {
      name: 'Sabores',
      minSelect: 1,
      maxSelect: 2,
      pricingMode: 'max',
      options: [
        { name: 'Mussarela', priceCents: 0 },
        { name: 'Calabresa', priceCents: 500 },
        { name: 'Portuguesa', priceCents: 800 },
      ],
    },
  });
  if (sabores.statusCode !== 201) throw new Error(sabores.body);
  const saboresGroup = sabores.json().group;

  const borda = await ctx.admin({
    method: 'POST',
    url: '/api/catalog/option-groups',
    payload: { name: 'Borda', minSelect: 0, maxSelect: 1, pricingMode: 'sum', options: [{ name: 'Catupiry', priceCents: 600 }] },
  });
  const bordaGroup = borda.json().group;

  const adicionais = await ctx.admin({
    method: 'POST',
    url: '/api/catalog/option-groups',
    payload: { name: 'Adicionais', minSelect: 0, maxSelect: 5, pricingMode: 'sum', options: [{ name: 'Bacon', priceCents: 300, maxQuantity: 3 }] },
  });
  const adicionaisGroup = adicionais.json().group;

  const pizza = await ctx.admin({
    method: 'POST',
    url: '/api/catalog/products',
    payload: {
      categoryId,
      name: 'Pizza',
      priceCents: 0,
      variants: [
        { name: 'Média', priceCents: 4000 },
        { name: 'Grande', priceCents: 5000 },
      ],
      optionGroupIds: [saboresGroup.id, bordaGroup.id, adicionaisGroup.id],
    },
  });
  if (pizza.statusCode !== 201) throw new Error(pizza.body);
  const pizzaDto = pizza.json().product;

  const refri = await ctx.admin({
    method: 'POST',
    url: '/api/catalog/products',
    payload: { categoryId, name: 'Refrigerante 2L', priceCents: 1200 },
  });
  const refriId = refri.json().product.id as string;

  const zone = await ctx.admin({ method: 'POST', url: '/api/delivery-zones', payload: { name: 'Centro', feeCents: 500, minOrderCents: 2000 } });
  if (zone.statusCode !== 201) throw new Error(zone.body);

  // horários e pagamentos
  const settings = await ctx.admin({
    method: 'PATCH',
    url: '/api/business',
    payload: {
      settings: {
        openingHours: { mon: [{ open: '00:00', close: '00:00' }], tue: [{ open: '00:00', close: '00:00' }], wed: [{ open: '00:00', close: '00:00' }], thu: [{ open: '00:00', close: '00:00' }], fri: [{ open: '00:00', close: '00:00' }], sat: [{ open: '00:00', close: '00:00' }], sun: [{ open: '00:00', close: '00:00' }] },
        fulfillment: { delivery: true, pickup: true, dineIn: true, reservations: false },
      },
    },
  });
  if (settings.statusCode !== 200) throw new Error(settings.body);

  const findOpt = (group: { options: { id: string; name: string }[] }, n: string) => group.options.find((o) => o.name === n)!.id;
  return {
    categoryId,
    pizzaId: pizzaDto.id,
    mediaId: pizzaDto.variants.find((v: { name: string }) => v.name === 'Média').id,
    grandeId: pizzaDto.variants.find((v: { name: string }) => v.name === 'Grande').id,
    refriId,
    saboresGroupId: saboresGroup.id,
    mussarelaId: findOpt(saboresGroup, 'Mussarela'),
    calabresaId: findOpt(saboresGroup, 'Calabresa'),
    portuguesaId: findOpt(saboresGroup, 'Portuguesa'),
    bordaGroupId: bordaGroup.id,
    catupiryId: findOpt(bordaGroup, 'Catupiry'),
    adicionaisGroupId: adicionaisGroup.id,
    baconId: findOpt(adicionaisGroup, 'Bacon'),
    zoneId: zone.json().zone.id,
  };
}
