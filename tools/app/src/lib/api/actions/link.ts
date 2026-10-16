// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { callApi, projectApiPaths } from '../../swr';

export async function createLink(
  fromCard: string,
  toCard: string,
  linkType: string,
  linkDescription?: string,
  direction: 'outbound' | 'inbound' = 'outbound',
  projectPrefix?: string,
) {
  const apiPaths = projectApiPaths(projectPrefix);
  return callApi(apiPaths.cardLinks(fromCard), 'POST', {
    toCard,
    linkType,
    description: linkDescription,
    direction,
  });
}

export async function removeLink(
  fromCard: string,
  toCard: string,
  linkType: string,
  linkDescription?: string,
  direction: 'outbound' | 'inbound' = 'outbound',
  projectPrefix?: string,
) {
  const apiPaths = projectApiPaths(projectPrefix);
  return callApi(apiPaths.cardLinks(fromCard), 'DELETE', {
    toCard,
    linkType,
    description: linkDescription,
    direction,
  });
}

export async function updateLink(
  fromCard: string,
  toCard: string,
  linkType: string,
  direction: 'outbound' | 'inbound' = 'outbound',
  previousToCard: string,
  previousLinkType: string,
  previousDirection: 'outbound' | 'inbound' = 'outbound',
  linkDescription?: string,
  previousLinkDescription?: string,
  projectPrefix?: string,
) {
  const apiPaths = projectApiPaths(projectPrefix);
  return callApi(apiPaths.cardLinks(fromCard), 'PUT', {
    toCard,
    linkType,
    description: linkDescription,
    direction,
    previousToCard,
    previousLinkType,
    previousDirection,
    previousDescription: previousLinkDescription,
  });
}
