// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Workspace } from '@cyberismo/data-handler';
export async function createGraphView(ws: Workspace, graphViewName: string) {
  await ws.resources.create(graphViewName, 'graphViews', {});
}
