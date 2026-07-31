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

import { describe, expect, it } from 'vitest';

import {
  canonicalHubLocation,
  hubModuleListUrl,
} from '../src/utils/hub-utils.js';

describe('canonicalHubLocation', () => {
  it.each([
    ['https://example.com/hub', 'https://example.com/hub/'],
    ['https://example.com/hub/', 'https://example.com/hub/'],
    ['https://example.com/hub///', 'https://example.com/hub/'],
    ['  https://example.com/hub  ', 'https://example.com/hub/'],
    ['https://example.com', 'https://example.com/'],
  ])('gives %s a single trailing slash', (input, expected) => {
    expect(canonicalHubLocation(input)).toBe(expected);
  });

  it.each([
    ['https://example.com/hub/moduleList.json', 'https://example.com/hub/'],
    ['https://example.com/hub/moduleList.json/', 'https://example.com/hub/'],
    ['https://example.com/moduleList.json', 'https://example.com/'],
  ])('names the directory holding %s', (input, expected) => {
    expect(canonicalHubLocation(input)).toBe(expected);
  });

  it.each([
    [
      'https://example.com/hub/foo-moduleList.json',
      'https://example.com/hub/foo-moduleList.json/',
    ],
    [
      'https://example.com/mymoduleList.json',
      'https://example.com/mymoduleList.json/',
    ],
  ])('treats %s as a directory of its own', (input, expected) => {
    expect(canonicalHubLocation(input)).toBe(expected);
  });

  it.each([
    ['', ''],
    ['   ', ''],
    ['///', ''],
  ])('has nothing to canonicalize in %j', (input, expected) => {
    expect(canonicalHubLocation(input)).toBe(expected);
  });
});

describe('hubModuleListUrl', () => {
  it.each([
    'https://example.com/hub',
    'https://example.com/hub/',
    'https://example.com/hub/moduleList.json',
  ])('resolves the module list of %s without losing a segment', (location) => {
    expect(hubModuleListUrl(location).href).toBe(
      'https://example.com/hub/moduleList.json',
    );
  });

  it('keeps a segment that merely ends with the file name', () => {
    expect(
      hubModuleListUrl('https://example.com/hub/foo-moduleList.json').href,
    ).toBe('https://example.com/hub/foo-moduleList.json/moduleList.json');
  });
});
