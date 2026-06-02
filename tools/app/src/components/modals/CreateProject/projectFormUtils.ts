/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

export interface ProjectFormData {
  name: string;
  prefix: string;
  category: string;
  description: string;
}

// Must match Validate.validatePrefix in data-handler: ^[a-z]+$, length 3-10
const PREFIX_PATTERN = /^[a-z]{3,10}$/;
// Must match Validate.isValidProjectName in data-handler: ^[A-Za-z ._-]+$, length 1-63
const PROJECT_NAME_PATTERN = /^[A-Za-z ._-]+$/;

export function isPrefixValid(prefix: string): boolean {
  return prefix.length === 0 || PREFIX_PATTERN.test(prefix);
}

export function canSubmitProjectForm(form: ProjectFormData): boolean {
  const name = form.name.trim();
  return (
    name.length > 0 &&
    name.length < 64 &&
    PROJECT_NAME_PATTERN.test(name) &&
    form.prefix.length >= 3 &&
    isPrefixValid(form.prefix)
  );
}
