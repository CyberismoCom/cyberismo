import { renderHook } from '@testing-library/react';
import { expect, vi, describe, it, beforeEach } from 'vitest';
import { useResourceTree } from '../src/lib/api/resources';

// Mock dependencies
vi.mock('../src/lib/api/project', () => ({
  useProject: vi.fn(),
}));

vi.mock('../src/lib/hooks', () => ({
  useUpdating: vi.fn(() => ({
    isUpdating: false,
    call: vi.fn(),
  })),
}));

vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(() => ({
    t: vi.fn((key: string) => {
      const translations: { [key: string]: string } = {
        'resources.calculations': 'Calculations',
        'resources.cardTypes': 'Card Types',
        'resources.fieldTypes': 'Field Types',
        'resources.graphModels': 'Graph Models',
        'resources.graphViews': 'Graph Views',
        'resources.linkTypes': 'Link Types',
        'resources.reports': 'Reports',
        'resources.templates': 'Templates',
        'resources.workflows': 'Workflows',
        'resources.modules': 'Modules',
      };
      return translations[key] || key;
    }),
  })),
}));

vi.mock('swr', () => ({
  __esModule: true,
  default: vi.fn(),
}));

import useSWR from 'swr';
import { useProject } from '../src/lib/api/project';

const mockUseSWR = useSWR as ReturnType<typeof vi.fn>;
const mockUseProject = useProject as ReturnType<typeof vi.fn>;

describe('useResourceTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty tree when no resources are available', () => {
    // Mock project
    mockUseProject.mockReturnValue({
      project: { prefix: 'test' },
    });

    // Mock useSWR to return empty arrays for all resource types
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key?.includes('/api/resources/')) {
        return {
          data: [],
          isLoading: false,
          error: null,
        };
      }
      return { data: null, isLoading: false, error: null };
    });

    const { result } = renderHook(() => useResourceTree());

    expect(result.current.data).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(false);
    expect(result.current.isUpdating).toBe(false);
  });

  it('should build tree with project resources (same prefix)', () => {
    // Mock project
    mockUseProject.mockReturnValue({
      project: { prefix: 'test' },
    });

    // Mock useSWR responses for different resource types
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === '/api/resources/cardTypes') {
        return {
          data: ['test/cardTypes/simplePage', 'test/cardTypes/complexPage'],
          isLoading: false,
          error: null,
        };
      }
      if (key === '/api/resources/workflows') {
        return {
          data: ['test/workflows/simple', 'test/workflows/complex'],
          isLoading: false,
          error: null,
        };
      }
      if (key?.includes('/api/resources/')) {
        return {
          data: [],
          isLoading: false,
          error: null,
        };
      }
      return { data: null, isLoading: false, error: null };
    });

    const { result } = renderHook(() => useResourceTree());

    expect(result.current.data).toHaveLength(2);

    // Check cardTypes section
    const cardTypesSection = result.current.data.find(
      (item) => item.id === 'cardTypes',
    );
    expect(cardTypesSection).toBeDefined();
    expect(cardTypesSection?.label).toBe('Card Types');
    expect(cardTypesSection?.children).toHaveLength(2);
    expect(cardTypesSection?.children?.[0].label).toBe(
      'test/cardTypes/simplePage',
    );

    // Check workflows section
    const workflowsSection = result.current.data.find(
      (item) => item.id === 'workflows',
    );
    expect(workflowsSection).toBeDefined();
    expect(workflowsSection?.label).toBe('Workflows');
    expect(workflowsSection?.children).toHaveLength(2);
  });

  it('should build tree with module resources (different prefix)', () => {
    // Mock project
    mockUseProject.mockReturnValue({
      project: { prefix: 'test' },
    });

    // Mock useSWR responses with module resources
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key === '/api/resources/cardTypes') {
        return {
          data: [
            'test/cardTypes/simplePage', // Same prefix as project
            'module1/cardTypes/modulePage', // Different prefix (module)
            'module2/cardTypes/anotherPage', // Another module
          ],
          isLoading: false,
          error: null,
        };
      }
      if (key === '/api/resources/workflows') {
        return {
          data: ['test/workflows/simple', 'module1/workflows/moduleWorkflow'],
          isLoading: false,
          error: null,
        };
      }
      if (key?.includes('/api/resources/')) {
        return {
          data: [],
          isLoading: false,
          error: null,
        };
      }
      return { data: null, isLoading: false, error: null };
    });

    const { result } = renderHook(() => useResourceTree());

    // Should have 3 sections: cardTypes, workflows, and modules
    expect(result.current.data).toHaveLength(3);

    // Check project resources
    const cardTypesSection = result.current.data.find(
      (item) => item.id === 'cardTypes',
    );
    expect(cardTypesSection?.children).toHaveLength(1); // Only test/cardTypes/simplePage

    const workflowsSection = result.current.data.find(
      (item) => item.id === 'workflows',
    );
    expect(workflowsSection?.children).toHaveLength(1); // Only test/workflows/simple

    // Check modules section
    const modulesSection = result.current.data.find(
      (item) => item.id === 'modules',
    );
    expect(modulesSection).toBeDefined();
    expect(modulesSection?.label).toBe('Modules');
    expect(modulesSection?.children).toHaveLength(2); // module1 and module2

    // Check module1 structure
    const module1 = modulesSection?.children?.find(
      (child) => child.label === 'module1',
    );
    expect(module1).toBeDefined();
    expect(module1?.children).toHaveLength(2); // cardTypes and workflows

    const module1CardTypes = module1?.children?.find(
      (child) => child.label === 'Card Types',
    );
    expect(module1CardTypes?.children).toHaveLength(1);
    expect(module1CardTypes?.children?.[0].label).toBe(
      'module1/cardTypes/modulePage',
    );

    // Check module2 structure
    const module2 = modulesSection?.children?.find(
      (child) => child.label === 'module2',
    );
    expect(module2).toBeDefined();
    expect(module2?.children).toHaveLength(1); // Only cardTypes
  });

  it('should handle loading states correctly', () => {
    // Mock project
    mockUseProject.mockReturnValue({
      project: { prefix: 'test' },
    });

    // Mock some resources as loading
    let callCount = 0;
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key?.includes('/api/resources/')) {
        callCount++;
        return {
          data: null,
          isLoading: callCount <= 3, // First 3 calls are loading
          error: null,
        };
      }
      return { data: null, isLoading: false, error: null };
    });

    const { result } = renderHook(() => useResourceTree());

    expect(result.current.isLoading).toBe(true);
  });

  it('should handle error states correctly', () => {
    // Mock project
    mockUseProject.mockReturnValue({
      project: { prefix: 'test' },
    });

    // Mock some resources with errors
    let callCount = 0;
    mockUseSWR.mockImplementation((key: string | null) => {
      if (key?.includes('/api/resources/')) {
        callCount++;
        return {
          data: null,
          isLoading: false,
          error: callCount === 1 ? new Error('API Error') : null, // First call has error
        };
      }
      return { data: null, isLoading: false, error: null };
    });

    const { result } = renderHook(() => useResourceTree());

    expect(result.current.error).toBe(true);
  });
});
