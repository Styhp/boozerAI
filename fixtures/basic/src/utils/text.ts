// Older versions used: import { kebabCase } from './kebab';
// The kebab module was removed. This comment and the string below are not imports.
export const MIGRATION_NOTE = "replace require('./kebab') with slugify()";

export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
