import { describe, expect, test, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { render, screen } from '@testing-library/react';

import { useConfigTemplateCreationContext } from '@/lib/hooks';
import { formKeyHandler } from '@/lib/hooks/utils';
import type { AnyNode } from '@/lib/api/types';

/**
 * Creates a mock React keyboard event for testing
 */
function createKeyboardEvent(
  key: string,
  options: {
    ctrlKey?: boolean;
    target?: { tagName: string };
  } = {},
): React.KeyboardEvent {
  return {
    key,
    ctrlKey: options.ctrlKey ?? false,
    target: options.target ?? { tagName: 'INPUT' },
    preventDefault: vi.fn(),
  } as unknown as React.KeyboardEvent;
}

describe('formKeyHandler', () => {
  describe('Enter key behavior', () => {
    test('calls onSubmit when Enter is pressed and canSubmit is true', () => {
      const onSubmit = vi.fn();
      const handler = formKeyHandler({ canSubmit: true, onSubmit });

      const event = createKeyboardEvent('Enter');
      handler(event);

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    test('does not call onSubmit when Enter is pressed and canSubmit is false', () => {
      const onSubmit = vi.fn();
      const handler = formKeyHandler({ canSubmit: false, onSubmit });

      const event = createKeyboardEvent('Enter');
      handler(event);

      expect(onSubmit).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    test('does not call onSubmit for plain Enter in textarea (allows newlines)', () => {
      const onSubmit = vi.fn();
      const handler = formKeyHandler({ canSubmit: true, onSubmit });

      const event = createKeyboardEvent('Enter', {
        target: { tagName: 'TEXTAREA' },
      });
      handler(event);

      expect(onSubmit).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    test('calls onSubmit for Ctrl+Enter in textarea', () => {
      const onSubmit = vi.fn();
      const handler = formKeyHandler({ canSubmit: true, onSubmit });

      const event = createKeyboardEvent('Enter', {
        ctrlKey: true,
        target: { tagName: 'TEXTAREA' },
      });
      handler(event);

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    test('calls onSubmit for Enter in regular input', () => {
      const onSubmit = vi.fn();
      const handler = formKeyHandler({ canSubmit: true, onSubmit });

      const event = createKeyboardEvent('Enter', {
        target: { tagName: 'INPUT' },
      });
      handler(event);

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(event.preventDefault).toHaveBeenCalled();
    });
  });

  describe('Escape key behavior', () => {
    test('calls onCancel when Escape is pressed', () => {
      const onSubmit = vi.fn();
      const onCancel = vi.fn();
      const handler = formKeyHandler({ canSubmit: true, onSubmit, onCancel });

      const event = createKeyboardEvent('Escape');
      handler(event);

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
      expect(event.preventDefault).toHaveBeenCalled();
    });

    test('does not throw when Escape is pressed without onCancel handler', () => {
      const onSubmit = vi.fn();
      const handler = formKeyHandler({ canSubmit: true, onSubmit });

      const event = createKeyboardEvent('Escape');

      expect(() => handler(event)).not.toThrow();
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('other keys', () => {
    test('ignores other keys', () => {
      const onSubmit = vi.fn();
      const onCancel = vi.fn();
      const handler = formKeyHandler({ canSubmit: true, onSubmit, onCancel });

      const event = createKeyboardEvent('Tab');
      handler(event);

      expect(onSubmit).not.toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });
});

let mockedResourceTree: AnyNode[] | null = null;

// Mock useResourceTree to control resource tree structure
vi.mock('@/lib/api/resources', async () => {
  return {
    useResourceTree: () => ({ resourceTree: mockedResourceTree }),
  };
});

function HookProbe() {
  const { showTemplateCard, templateResource, parentCardKey } =
    useConfigTemplateCreationContext();
  return (
    <div>
      <div data-testid="show">{String(showTemplateCard)}</div>
      <div data-testid="template">{templateResource}</div>
      <div data-testid="parent">{parentCardKey ?? ''}</div>
    </div>
  );
}

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="*" element={<HookProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('useConfigTemplateCreationContext', () => {
  beforeEach(() => {
    mockedResourceTree = null;
  });

  test('returns template context on templates route', () => {
    mockedResourceTree = [];
    renderAt('/configuration/test/templates/mytemplate');

    expect(screen.getByTestId('show').textContent).toBe('true');
    expect(screen.getByTestId('template').textContent).toBe(
      'test/templates/mytemplate',
    );
    expect(screen.getByTestId('parent').textContent).toBe('');
  });

  test('resolves template from resourceTree on card route', () => {
    // Mock tree structure: test/templates/mytemplate -> test/cards/test_ic2n3e7w
    mockedResourceTree = [
      {
        id: 'test/templates/mytemplate',
        name: 'test/templates/mytemplate',
        type: 'templates',
        children: [
          {
            id: 'test_ic2n3e7w',
            name: 'test/cards/test_ic2n3e7w',
            type: 'card',
          } as unknown as AnyNode,
        ],
      } as unknown as AnyNode,
    ];

    renderAt('/configuration/test/cards/test_ic2n3e7w');

    expect(screen.getByTestId('show').textContent).toBe('true');
    expect(screen.getByTestId('template').textContent).toBe(
      'test/templates/mytemplate',
    );
    expect(screen.getByTestId('parent').textContent).toBe('test_ic2n3e7w');
  });

  test('returns false outside configuration', () => {
    mockedResourceTree = [];
    renderAt('/cards');
    expect(screen.getByTestId('show').textContent).toBe('false');
    expect(screen.getByTestId('template').textContent).toBe('');
    expect(screen.getByTestId('parent').textContent).toBe('');
  });

  test('returns false in other resources', () => {
    mockedResourceTree = [];
    renderAt('/configuration/test/fieldTypes/myfieldtype');
    expect(screen.getByTestId('show').textContent).toBe('false');
    expect(screen.getByTestId('template').textContent).toBe('');
    expect(screen.getByTestId('parent').textContent).toBe('');
  });

  test('handles nested card structure correctly', () => {
    // Test deeper nesting: module/templates/template -> cards -> nested cards
    mockedResourceTree = [
      {
        id: 'test/templates/mytemplate',
        name: 'test/templates/mytemplate',
        type: 'templates',
        children: [
          {
            id: 'parent_card',
            name: 'test/cards/parent_card',
            type: 'card',
            children: [
              {
                id: 'nested_card',
                name: 'test/cards/nested_card',
                type: 'card',
              } as unknown as AnyNode,
            ],
          } as unknown as AnyNode,
        ],
      } as unknown as AnyNode,
    ];

    renderAt('/configuration/test/cards/nested_card');

    expect(screen.getByTestId('show').textContent).toBe('true');
    expect(screen.getByTestId('template').textContent).toBe(
      'test/templates/mytemplate',
    );
    expect(screen.getByTestId('parent').textContent).toBe('nested_card');
  });
});
