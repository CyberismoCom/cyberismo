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

import { describe, expect, it } from 'vitest';
import type { RootState } from '@/lib/store';
import projectReducer, {
  deriveLastPath,
  initialState,
  projectEntryPath,
  selectLastPathByPrefix,
  setLastPathForPrefix,
} from '@/lib/slices/project';

describe('deriveLastPath', () => {
  it('extracts the project-relative sub-path for a matching prefix', () => {
    expect(deriveLastPath('/projects/decision/cards/DEC-5', 'decision')).toBe(
      '/cards/DEC-5',
    );
  });

  it('extracts a configuration sub-path', () => {
    expect(
      deriveLastPath('/projects/decision/configuration/cardTypes', 'decision'),
    ).toBe('/configuration/cardTypes');
  });

  it('defaults to /cards for the bare project root', () => {
    expect(deriveLastPath('/projects/decision', 'decision')).toBe('/cards');
  });

  it('returns null for a path under a different project', () => {
    expect(
      deriveLastPath('/projects/other/cards/DEC-5', 'decision'),
    ).toBeNull();
  });

  it('returns null for an unrecognized section (e.g. a 404 path shape)', () => {
    expect(
      deriveLastPath('/projects/decision/not-a-real-section', 'decision'),
    ).toBeNull();
  });
});

describe('projectSlice reducer', () => {
  it('records a last path per prefix without touching other prefixes', () => {
    const afterFirst = projectReducer(
      initialState,
      setLastPathForPrefix({ prefix: 'decision', path: '/cards/DEC-5' }),
    );
    const afterSecond = projectReducer(
      afterFirst,
      setLastPathForPrefix({ prefix: 'other', path: '/configuration' }),
    );

    expect(afterSecond.lastPathByPrefix).toEqual({
      decision: '/cards/DEC-5',
      other: '/configuration',
    });
  });

  it('overwrites the previous path for the same prefix', () => {
    const afterFirst = projectReducer(
      initialState,
      setLastPathForPrefix({ prefix: 'decision', path: '/cards/DEC-5' }),
    );
    const afterSecond = projectReducer(
      afterFirst,
      setLastPathForPrefix({ prefix: 'decision', path: '/cards/DEC-6' }),
    );

    expect(afterSecond.lastPathByPrefix).toEqual({ decision: '/cards/DEC-6' });
  });
});

// redux-persist's default autoMergeLevel1 replaces the `project` slice wholesale
// on REHYDRATE, so anyone upgrading from a build without `lastPathByPrefix` gets
// a slice that has no such key. Every read and write of it must survive that.
describe('rehydration from a state persisted before lastPathByPrefix existed', () => {
  const legacySlice = {
    projectPrefix: 'decision',
    recentPrefixes: ['decision'],
  } as unknown as typeof initialState;
  const legacyState = { project: legacySlice } as RootState;

  it('the reducer creates the map instead of throwing', () => {
    const next = projectReducer(
      legacySlice,
      setLastPathForPrefix({ prefix: 'decision', path: '/cards/DEC-5' }),
    );

    expect(next.lastPathByPrefix).toEqual({ decision: '/cards/DEC-5' });
  });

  it('selectLastPathByPrefix returns a stable empty map', () => {
    expect(selectLastPathByPrefix(legacyState)).toEqual({});
    expect(selectLastPathByPrefix(legacyState)).toBe(
      selectLastPathByPrefix(legacyState),
    );
  });

  it('projectEntryPath falls back to /cards', () => {
    expect(projectEntryPath('decision', undefined)).toBe(
      '/projects/decision/cards',
    );
  });
});

describe('selectors', () => {
  const state = {
    project: {
      projectPrefix: 'decision',
      recentPrefixes: [],
      lastPathByPrefix: { decision: '/cards/DEC-5' },
    },
  } as unknown as RootState;

  it('selectLastPathByPrefix returns the whole map', () => {
    expect(selectLastPathByPrefix(state)).toEqual({ decision: '/cards/DEC-5' });
  });
});

describe('projectEntryPath', () => {
  it('builds the stored path for a known prefix', () => {
    expect(projectEntryPath('decision', { decision: '/cards/DEC-5' })).toBe(
      '/projects/decision/cards/DEC-5',
    );
  });

  it('falls back to /cards for a prefix with no stored path', () => {
    expect(projectEntryPath('decision', {})).toBe('/projects/decision/cards');
  });
});
