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

import type { MouseEvent } from 'react';
import { Link } from 'react-router';
import type { LinkProps } from 'react-router';
import { useAppRouter } from '../lib/hooks';

/**
 * A version of React Router's Link that uses safePush,
 * prompting the user before navigating away from unsaved edits.
 */
export function SafeRouterLink({ to, children, ...rest }: LinkProps) {
  const router = useAppRouter();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    router.safePush(String(to));
  };

  return (
    <Link to={to} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
