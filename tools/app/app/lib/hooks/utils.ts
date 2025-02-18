/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { findParentCard } from '../utils';
import { useTree } from '../api';

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
    : // @ts-ignore
      contentBoxSize[accessor];
}
/**
 * This hook is used to observe the size of a DOM element.
 * @returns the width and height of the element and a ref to be attached to the element
 */
export function useResizeObserver() {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [node, setNode] = useState<HTMLElement | null>(null);

  const callbackRef = useCallback((node: HTMLElement | null) => {
    setNode(node);
  }, []);

  useEffect(() => {
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      requestAnimationFrame(() => {
        const entry = entries[0];
        setDimensions({
          width: getEntryValue(entry, 'width'),
          height: getEntryValue(entry, 'height'),
        });
      });
    });

    observer.observe(node);

    return () => {
      observer.unobserve(node);
      observer.disconnect();
    };
  }, [node]);

  return { ...dimensions, ref: callbackRef };
}
