import {
  stockLevel,
  stockValue,
} from './inventory';
import type { Item } from './inventory';
import { formatPrice } from './format.js';
import { sum, slugify } from './utils';
import { toPdf } from './export-pdf';
import config from './config';

export function buildReport(items: readonly Item[]): string {
  const lines = items.map(
    (item) => `${slugify(item.name)}: ${stockLevel(item)} ${formatPrice(stockValue(item), config.currency)}`,
  );
  const total = sum(items.map(stockValue));
  return [...lines, `total ${formatPrice(total, config.currency)}`].join('\n');
}

export async function exportReport(items: readonly Item[], format: 'csv' | 'pdf'): Promise<string> {
  if (format === 'pdf') return toPdf(buildReport(items));
  const { toCsv } = await import('./export-csv');
  return toCsv(items);
}

export async function exportWith(exporterPath: string, items: readonly Item[]): Promise<string> {
  const exporter = await import(exporterPath);
  return exporter.default(items);
}
