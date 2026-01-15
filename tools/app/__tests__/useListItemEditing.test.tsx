import { describe, expect, test } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useListItemEditing } from '@/lib/hooks/useListItemEditing';

describe('useListItemEditing', () => {
  test('initializes with null editing and delete states', () => {
    const { result } = renderHook(() => useListItemEditing<string>());

    expect(result.current.editingItem).toBeNull();
    expect(result.current.itemToDelete).toBeNull();
    expect(result.current.isEditingLocked).toBe(false);
  });

  describe('editing state', () => {
    test('startEditing sets the editing item', () => {
      const { result } = renderHook(() => useListItemEditing<string>());

      act(() => {
        result.current.startEditing('item-1');
      });

      expect(result.current.editingItem).toBe('item-1');
      expect(result.current.isEditingLocked).toBe(true);
    });

    test('cancelEditing clears the editing item', () => {
      const { result } = renderHook(() => useListItemEditing<string>());

      act(() => {
        result.current.startEditing('item-1');
      });

      expect(result.current.editingItem).toBe('item-1');

      act(() => {
        result.current.cancelEditing();
      });

      expect(result.current.editingItem).toBeNull();
      expect(result.current.isEditingLocked).toBe(false);
    });

    test('can switch to editing a different item', () => {
      const { result } = renderHook(() => useListItemEditing<string>());

      act(() => {
        result.current.startEditing('item-1');
      });

      expect(result.current.editingItem).toBe('item-1');

      act(() => {
        result.current.startEditing('item-2');
      });

      expect(result.current.editingItem).toBe('item-2');
      expect(result.current.isEditingLocked).toBe(true);
    });
  });

  describe('delete state', () => {
    test('setItemToDelete sets the item pending deletion', () => {
      const { result } = renderHook(() =>
        useListItemEditing<{ id: string; name: string }>(),
      );

      const item = { id: '1', name: 'Test Item' };

      act(() => {
        result.current.setItemToDelete(item);
      });

      expect(result.current.itemToDelete).toEqual(item);
    });

    test('clearItemToDelete clears the pending deletion', () => {
      const { result } = renderHook(() =>
        useListItemEditing<{ id: string; name: string }>(),
      );

      const item = { id: '1', name: 'Test Item' };

      act(() => {
        result.current.setItemToDelete(item);
      });

      expect(result.current.itemToDelete).toEqual(item);

      act(() => {
        result.current.clearItemToDelete();
      });

      expect(result.current.itemToDelete).toBeNull();
    });

    test('delete state is independent of editing state', () => {
      const { result } = renderHook(() => useListItemEditing<string>());

      act(() => {
        result.current.startEditing('item-1');
        result.current.setItemToDelete('item-2');
      });

      expect(result.current.editingItem).toBe('item-1');
      expect(result.current.itemToDelete).toBe('item-2');
      expect(result.current.isEditingLocked).toBe(true);

      act(() => {
        result.current.cancelEditing();
      });

      expect(result.current.editingItem).toBeNull();
      expect(result.current.itemToDelete).toBe('item-2');
      expect(result.current.isEditingLocked).toBe(false);
    });
  });
});
