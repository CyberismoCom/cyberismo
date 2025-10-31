/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { findParentCard } from '../utils';
import { useTree } from '../api';
import { useLocation, useParams } from 'react-router';
import { useResourceTree } from '../api/resources';
import type { AnyNode } from '../api/types';

export function useRequiredKeyParam() {
  const key = useOptionalKeyParam();
  if (!key) {
    throw new Error('useKeyParam hook used in a path without a key');
  }
  return key;
}

export function useOptionalKeyParam() {
  const params = useParams<{ key: string }>();
  if (!params.key || typeof params.key !== 'string') {
    return null;
  }
  return params.key as string;
}

export function useParentCard(key: string | null) {
  const { tree } = useTree();

  return useMemo(
    () => (tree && key ? findParentCard(tree, key) : null),
    [tree, key],
  );
}

export function handleUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = true; // for legacy browsers
}
/**
 * This function creates a method that looks like the orignal method, but it will show a confirmation dialog before executing the original method.
 * @param fn - the function to wrap
 * @param msg - the message to show in the confirmation dialog
 * @returns the wrapped function
 */
export function createFunctionGuard<T extends unknown[], U>(
  fn: (...args: T) => U,
  msg: string,
) {
  return (...args: T) => {
    if (window.confirm(msg)) {
      return fn(...args);
    }
  };
}

/**
 * A defined keyboard combination
 */
export type KeyCombo = {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
};

/**
 * Handler for keyboard shortcuts
 */
export type ShortcutHandler = (event: KeyboardEvent) => void;

/**
 * Stores keyboard shortcuts and their handlers
 */
export type ShortcutRegistry = Map<string, Set<ShortcutHandler>>;

// Singleton registry to manage shortcuts across components
const shortcutRegistry: ShortcutRegistry = new Map();

/**
 * Generates a unique string key for a keyboard combination
 * Used internally to store and match shortcuts so that only one check is needed per event
 * @param combo - The keyboard combination
 * @returns A string representation of the combination
 */
export function generateComboKey(combo: KeyCombo): string {
  const modifiers = [
    combo.ctrlKey && 'Ctrl',
    combo.altKey && 'Alt',
    combo.shiftKey && 'Shift',
    combo.metaKey && 'Meta',
  ]
    .filter(Boolean)
    .join('+');

  return modifiers ? `${modifiers}+${combo.key}` : combo.key;
}

/**
 * Checks if a KeyboardEvent matches a KeyCombo
 * Used internally to determine if a shortcut should be triggered
 * @param event - The keyboard event
 * @param combo - The keyboard combination to check against
 * @returns Whether the event matches the combo
 */
export function matchesCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
  return (
    event.key.toLowerCase() === combo.key.toLowerCase() &&
    !!event.ctrlKey === !!combo.ctrlKey &&
    !!event.altKey === !!combo.altKey &&
    !!event.shiftKey === !!combo.shiftKey &&
    !!event.metaKey === !!combo.metaKey
  );
}

/**
 * Global keyboard event handler
 * Used internally to dispatch keyboard shortcuts
 * @param event - The keyboard event
 */
export function handleKeyDown(event: KeyboardEvent): void {
  // Skip if the event occurred in an input, textarea, or contentEditable element
  // Check both the target and any ancestor elements up the tree
  let element = event.target as HTMLElement | null;
  while (element) {
    if (
      element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.isContentEditable ||
      element.getAttribute('contenteditable') === 'true'
    ) {
      return;
    }
    element = element.parentElement;
  }

  shortcutRegistry.forEach((handlers, comboKey) => {
    const parts = comboKey.split('+');
    const combo: KeyCombo = {
      key: parts.pop() || '',
      ctrlKey: parts.includes('Ctrl'),
      altKey: parts.includes('Alt'),
      shiftKey: parts.includes('Shift'),
      metaKey: parts.includes('Meta'),
    };

    if (matchesCombo(event, combo)) {
      handlers.forEach((handler) => {
        handler(event);
        // Prevent default if at least one handler is registered
        event.preventDefault();
      });
    }
  });
}

/**
 * Hook for registering keyboard shortcuts
 * @param combo - The keyboard combination to listen for
 * @param callback - The function to call when the shortcut is triggered
 * @param deps - Dependencies array for the callback (similar to useEffect)
 */
export function useKeyboardShortcut(
  combo: KeyCombo,
  callback: ShortcutHandler,
): void {
  // Use a ref to hold the current callback to avoid recreating the event listener
  const callbackRef = useRef<ShortcutHandler>(callback);

  // Update the ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    // Create a handler that uses the current callback from the ref
    const handler: ShortcutHandler = (event) => {
      callbackRef.current(event);
    };

    const comboKey = generateComboKey(combo);

    // Register the global keyboard handler if this is the first shortcut
    if (shortcutRegistry.size === 0) {
      document.addEventListener('keydown', handleKeyDown);
    }

    // Add this handler to the registry
    if (!shortcutRegistry.has(comboKey)) {
      shortcutRegistry.set(comboKey, new Set());
    }
    shortcutRegistry.get(comboKey)?.add(handler);

    // Clean up when the component unmounts
    return () => {
      const handlers = shortcutRegistry.get(comboKey);
      if (handlers) {
        handlers.delete(handler);

        // If no handlers left for this combo, remove the combo from registry
        if (handlers.size === 0) {
          shortcutRegistry.delete(comboKey);
        }

        // If registry is empty, remove the global event listener
        if (shortcutRegistry.size === 0) {
          document.removeEventListener('keydown', handleKeyDown);
        }
      }
    };
  }, [callback, combo]);
}

/**
 * This function is used to get the value of a ResizeObserverEntry.
 * @param entry - the ResizeObserverEntry
 * @param value - the value to get
 * @returns the value of the ResizeObserverEntry
 */
function getEntryValue(entry: ResizeObserverEntry, value: 'width' | 'height') {
  const { contentRect, contentBoxSize } = entry;

  if (!contentBoxSize) {
    if (!contentRect) {
      return 0;
    }
    return contentRect[value];
  }

  const accessor = value === 'width' ? 'inlineSize' : 'blockSize';
  return contentBoxSize[0]
    ? contentBoxSize[0][accessor]
    : // The below is a hack because some browsers did not implement the feature as specified
      // and instead returned an array-like object with direct accessor property
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      contentBoxSize[accessor];
}
/**
 * This hook is used to observe the size of a DOM element.
 * @returns the width and height of the element and a ref to be attached to the element
 */
export function useResizeObserver() {
  const [dimensions, setDimensions] = useState({
    width: undefined,
    height: undefined,
  });
  const [node, setNode] = useState<HTMLElement | null>(null);

  const callbackRef = useCallback((node: HTMLElement | null) => {
    setNode(node);
  }, []);

  useEffect(() => {
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      setDimensions({
        width: getEntryValue(entry, 'width'),
        height: getEntryValue(entry, 'height'),
      });
    });

    observer.observe(node);

    return () => {
      observer.unobserve(node);
      observer.disconnect();
    };
  }, [node]);

  return useMemo(() => {
    return { ...dimensions, ref: callbackRef };
  }, [dimensions, callbackRef]);
}

/**
 * Simple hook to set the document title
 * @param title - The title to set
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

/**
 * This hook is used to check if the current location is in the cards page.
 * @returns true if the current location is in the cards page, false otherwise
 */
export function useIsInCards() {
  const location = useLocation();
  return location.pathname.startsWith('/cards');
}

/**
 * Parses current route to determine template creation context in configuration views.
 * Returns whether template card creation is available, the template resource name, and parent card key (if any).
 */
export function useConfigTemplateCreationContext(): {
  showTemplateCard: boolean;
  templateResource: string;
  parentCardKey?: string;
} {
  const location = useLocation();
  const parts = location.pathname.split('/');
  const { resourceTree } = useResourceTree();

  const inConfiguration = parts.length >= 3 && parts[1] === 'configuration';
  const isTemplates =
    inConfiguration && parts.length >= 5 && parts[3] === 'templates';
  const isTemplateCard =
    inConfiguration && parts.length >= 5 && parts[3] === 'cards';

  let templateResource = isTemplates ? parts.slice(2, 5).join('/') : '';
  const parentCardKey = isTemplateCard ? parts[4] : undefined;

  // If inside a template card route, try to resolve the owning template from the resource tree
  if (!templateResource && isTemplateCard && resourceTree) {
    const cardKey = parts[4];
    const found = findTemplateForCard(resourceTree, cardKey);
    if (found) {
      templateResource = found;
    }
  }

  return {
    showTemplateCard: isTemplates || isTemplateCard,
    templateResource,
    parentCardKey,
  };
}

function findTemplateForCard(nodes: AnyNode[], cardKey: string): string | null {
  function depthFirstSearch(
    node: AnyNode,
    ancestors: AnyNode[],
  ): string | null {
    const newAncestors = [...ancestors, node];
    if (node.type === 'card' && node.id === cardKey) {
      // Walk ancestors backwards to find a 'templates' node
      for (let i = newAncestors.length - 1; i >= 0; i--) {
        const anc = newAncestors[i];
        if (anc.type === 'templates') {
          return anc.name;
        }
      }
    }
    if (node.children) {
      for (const child of node.children) {
        const result = depthFirstSearch(child as AnyNode, newAncestors);
        if (result) return result;
      }
    }
    return null;
  }

  for (const root of nodes) {
    const result = depthFirstSearch(root as AnyNode, []);
    if (result) return result;
  }
  return null;
}
