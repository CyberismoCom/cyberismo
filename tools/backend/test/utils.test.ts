// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { once } from 'node:events';
import { createServer, type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { listen } from '../src/utils.js';

describe('listen', () => {
  const holder = createServer();

  afterEach(() => {
    holder.close();
  });

  it('skips a port held on the host the server binds', async () => {
    holder.listen(0, '127.0.0.1');
    await once(holder, 'listening');
    const held = (holder.address() as AddressInfo).port;

    const { server, port } = await listen(
      () => new Response(),
      held,
      '127.0.0.1',
      held + 10,
    );
    server.close();

    expect(port).not.toBe(held);
  });
});
