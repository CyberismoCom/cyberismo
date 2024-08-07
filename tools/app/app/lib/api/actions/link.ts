/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
'use server';

import { Create } from '@cyberismocom/data-handler/create';
import { Calculate } from '@cyberismocom/data-handler/calculate';
import { Remove } from '@cyberismocom/data-handler/remove';

export async function createLink(
  fromCard: string,
  toCard: string,
  linkType: string,
  linkDescription?: string,
) {
  const projectPath = process.env.npm_config_project_path || '';

  const calc = new Calculate();
  const createCommand = new Create(calc);

  await createCommand.createLink(
    projectPath,
    fromCard,
    toCard,
    linkType,
    linkDescription,
  );
}

export async function removeLink(
  fromCard: string,
  toCard: string,
  linkType: string,
) {
  const projectPath = process.env.npm_config_project_path || '';

  const calc = new Calculate();
  const removeCommand = new Remove(calc);

  await removeCommand.remove(projectPath, 'link', fromCard, toCard, linkType);
}
