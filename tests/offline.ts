import { Socket } from 'node:net';
import { vi } from 'vitest';

// Default cases cannot contact even a loopback model. OS-denied runs verify this too.
vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => {
  throw new Error('Network access is forbidden in the default suite');
});
vi.stubGlobal('fetch', () => { throw new Error('Network access is forbidden in the default suite'); });
