export function toCsv(items: readonly { sku: string; quantity: number }[]): string {
  return items.map((item) => `${item.sku},${item.quantity}`).join('\n');
}
