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

import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// Regression coverage for INTDEV-1368: a resource saved elsewhere (another tab,
// another user, the CLI) arrives as a refetched resource tree while the
// configuration editor is open on it.

vi.mock('@/lib/api', () => ({
  useResourceTree: () => ({ resourceTree: [] }),
  useResource: () => ({ update: vi.fn().mockResolvedValue(undefined) }),
}));
vi.mock('@/lib/hooks/redux', () => ({
  useAppRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/lib/hooks', () => ({ useAppDispatch: () => vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));

import {
  useEditableField,
  useResourceEditorHelpers,
} from '@/lib/hooks/configurationEditor';
import type { ResourceNode } from '@/lib/api/types';

const nodeWith = (data: Record<string, unknown>) =>
  ({
    name: 'base/cardTypes/page',
    type: 'cardTypes',
    data: { name: 'base/cardTypes/page', ...data },
  }) as unknown as ResourceNode;

const renderWith = (data: Record<string, unknown>) =>
  renderHook(
    ({ node }: { node: ResourceNode }) => useResourceEditorHelpers(node),
    { initialProps: { node: nodeWith(data) } },
  );

describe('useResourceEditorHelpers on a save made elsewhere', () => {
  it('adopts the new saved value for an untouched field', () => {
    const { result, rerender } = renderWith({ displayName: 'Page' });

    rerender({ node: nodeWith({ displayName: 'Renamed elsewhere' }) });

    expect(result.current.form.displayName).toBe('Renamed elsewhere');
    expect(result.current.isDirty('displayName')).toBe(false);
  });

  it('adopts the new saved value for an untouched multi-value field', () => {
    const { result, rerender } = renderWith({ alwaysVisibleFields: ['a'] });

    rerender({ node: nodeWith({ alwaysVisibleFields: ['a', 'b'] }) });

    expect(result.current.form.alwaysVisibleFields).toEqual(['a', 'b']);
    expect(result.current.isDirty('alwaysVisibleFields')).toBe(false);
  });

  // Resource data is nested (workflow states, card type fields), and a refetch
  // hands back value-equal objects at fresh references. Comparing those by
  // reference would leave the form permanently dirty.
  it('does not go dirty when a nested value returns value-equal', () => {
    const states = [{ name: 'Draft', category: 'initial' }];
    const { result, rerender } = renderWith({ states });

    rerender({ node: nodeWith({ states: structuredClone(states) }) });

    expect(result.current.isDirty('states')).toBe(false);
  });

  it('counts a multi-value field with a repeated entry as dirty', () => {
    const { result, rerender } = renderWith({
      alwaysVisibleFields: ['a', 'b'],
    });

    act(() => result.current.onChange('alwaysVisibleFields', ['a', 'a']));
    rerender({ node: nodeWith({ alwaysVisibleFields: ['a', 'b'] }) });

    expect(result.current.form.alwaysVisibleFields).toEqual(['a', 'a']);
    expect(result.current.isDirty('alwaysVisibleFields')).toBe(true);
  });

  it('ignores the order of a multi-value field', () => {
    const { result } = renderWith({ alwaysVisibleFields: ['a', 'b'] });

    act(() => result.current.onChange('alwaysVisibleFields', ['b', 'a']));

    expect(result.current.isDirty('alwaysVisibleFields')).toBe(false);
  });

  it('keeps an unsaved edit typed here, still dirty against the new value', () => {
    const { result, rerender } = renderWith({ displayName: 'Page' });

    act(() => result.current.onChange('displayName', 'Typed here'));
    rerender({ node: nodeWith({ displayName: 'Renamed elsewhere' }) });

    expect(result.current.form.displayName).toBe('Typed here');
    expect(result.current.isDirty('displayName')).toBe(true);
  });

  it('cancel then reverts to the new saved value, not the old one', () => {
    const { result, rerender } = renderWith({ displayName: 'Page' });

    act(() => result.current.onChange('displayName', 'Typed here'));
    rerender({ node: nodeWith({ displayName: 'Renamed elsewhere' }) });
    act(() => result.current.cancelField('displayName'));

    expect(result.current.form.displayName).toBe('Renamed elsewhere');
    expect(result.current.isDirty('displayName')).toBe(false);
  });
});

describe('useEditableField on a save made elsewhere', () => {
  const renderField = (initialValue: string) =>
    renderHook(
      ({ value }: { value: string }) =>
        useEditableField({
          initialValue: value,
          actionKey: 'update',
          readOnly: false,
          saveValue: vi.fn().mockResolvedValue(undefined),
          isUpdating: () => false,
        }),
      { initialProps: { value: initialValue } },
    );

  it('adopts the new saved value when nothing was typed here', () => {
    const { result, rerender } = renderField('Page');

    rerender({ value: 'Renamed elsewhere' });

    expect(result.current.value).toBe('Renamed elsewhere');
    expect(result.current.dirty).toBe(false);
  });

  it('keeps unsaved typing, still dirty against the new saved value', () => {
    const { result, rerender } = renderField('Page');

    act(() => result.current.setValue('Typed here'));
    rerender({ value: 'Renamed elsewhere' });

    expect(result.current.value).toBe('Typed here');
    expect(result.current.dirty).toBe(true);
  });
});
