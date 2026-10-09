// Deliberately invalid syntax: the parser must report a parse error and emit no edges.
import { sum } from './utils';
export function broken( {
  return sum([1, 2;
}
