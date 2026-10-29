// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

import {
  canonicalHubLocation,
  hubModuleListUrl,
} from '../../../src/infra/modules/hub-utils.js';

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
