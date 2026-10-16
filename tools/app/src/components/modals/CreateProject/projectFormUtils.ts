// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

export interface ProjectFormData {
  name: string;
  prefix: string;
  category: string;
  description: string;
}

// Must match Validate.validatePrefix on the server: ^[a-z]+$, length 3-10
const PREFIX_PATTERN = /^[a-z]{3,10}$/;
// Must match Validate.isValidProjectName on the server: ^[A-Za-z ._-]+$, length 1-63
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
