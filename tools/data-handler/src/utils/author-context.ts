/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { AsyncLocalStorage } from 'node:async_hooks';

export interface Author {
  name: string;
  email: string;
}

const authorContext = new AsyncLocalStorage<Author>();

export function runWithAuthor<T>(
  author: Author,
  fn: () => Promise<T>,
): Promise<T> {
  return authorContext.run(author, fn);
}

export function getAuthor(): Author | undefined {
  return authorContext.getStore();
}
