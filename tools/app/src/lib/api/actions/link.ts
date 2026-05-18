/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

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
