import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

let mockMode: 'system' | 'light' | 'dark' = 'system';
const mockSetMode = vi.fn();

vi.mock('@mui/joy/styles', () => ({
  useColorScheme: () => ({ mode: mockMode, setMode: mockSetMode }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useThemeCycle } from '@/lib/hooks/themeCycle';

describe('useThemeCycle', () => {
  beforeEach(() => {
    mockMode = 'system';
    mockSetMode.mockReset();
  });

  describe('switchLabel describes the next mode in the cycle', () => {
    test('system → light', () => {
      mockMode = 'system';
      const { result } = renderHook(() => useThemeCycle());
      expect(result.current.switchLabel).toBe('toolbar.switchToLight');
    });

    test('light → dark', () => {
      mockMode = 'light';
      const { result } = renderHook(() => useThemeCycle());
      expect(result.current.switchLabel).toBe('toolbar.switchToDark');
    });

    test('dark → system', () => {
      mockMode = 'dark';
      const { result } = renderHook(() => useThemeCycle());
      expect(result.current.switchLabel).toBe('toolbar.switchToSystem');
    });
  });

  describe('cycle advances the color scheme', () => {
    test('system → light', () => {
      mockMode = 'system';
      const { result } = renderHook(() => useThemeCycle());
      act(() => result.current.cycle());
      expect(mockSetMode).toHaveBeenCalledExactlyOnceWith('light');
    });

    test('light → dark', () => {
      mockMode = 'light';
      const { result } = renderHook(() => useThemeCycle());
      act(() => result.current.cycle());
      expect(mockSetMode).toHaveBeenCalledExactlyOnceWith('dark');
    });

    test('dark → system', () => {
      mockMode = 'dark';
      const { result } = renderHook(() => useThemeCycle());
      act(() => result.current.cycle());
      expect(mockSetMode).toHaveBeenCalledExactlyOnceWith('system');
    });
  });

  test('returns a non-null icon node', () => {
    mockMode = 'system';
    const { result } = renderHook(() => useThemeCycle());
    expect(result.current.icon).toBeTruthy();
  });
});
