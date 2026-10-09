import { priceFor } from './pricing';

export interface Item {
  sku: string;
  name: string;
  quantity: number;
}

export function stockLevel(item: Item): 'low' | 'ok' {
  return item.quantity < 5 ? 'low' : 'ok';
}

export function stockValue(item: Item): number {
  return priceFor(item) * item.quantity;
}
