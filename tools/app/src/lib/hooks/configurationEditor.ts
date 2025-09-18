/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResourceTree } from '@/lib/api';
import { updateResourceWithOperation } from '@/lib/api/resources';
import type { ResourceNode } from '@/lib/api/types';
import type {
  AddOperation,
  ChangeOperation,
  RemoveOperation,
} from '@cyberismo/data-handler';
import { useAppRouter } from '@/lib/hooks/redux';
import { useAppDispatch } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';

export function useResourceEditorHelpers(node: ResourceNode) {
  const originalData = ('data' in node ? node.data : {}) as Record<
    string,
    unknown
  >;
  const { resourceTree } = useResourceTree();
  const { push } = useAppRouter();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const [form, setForm] = useState<Record<string, unknown>>(() => ({
    ...originalData,
  }));
  const onChange = (key: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isArrayEqual = (a?: unknown, b?: unknown) => {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((v) => b.includes(v));
  };

  const isDirty = (key: string): boolean => {
    const oldVal = originalData?.[key];
    const newVal = form[key];
    if (Array.isArray(oldVal) || Array.isArray(newVal))
      return !isArrayEqual(oldVal, newVal);
    return oldVal !== newVal;
  };

  function changeOp<T>(oldValue: T, newValue: T): ChangeOperation<T> | null {
    if (oldValue === newValue) return null;
    return { name: 'change', target: oldValue, to: newValue };
  }
  function addOp<T>(value: T): AddOperation<T> {
    return { name: 'add', target: value };
  }
  function removeOp<T>(value: T): RemoveOperation<T> {
    return { name: 'remove', target: value };
  }

  const saveScalar = async (key: string) => {
    const op = changeOp(originalData?.[key] as never, form[key] as never);
    if (op) {
      try {
        await updateResourceWithOperation(node.name, { key, operation: op });

        // Success notification
        dispatch(
          addNotification({
            message:
              t('fieldSaved', { field: key }) ||
              `Field "${key}" saved successfully`,
            type: 'success',
          }),
        );

        // Handle identifier changes - navigate to new URL
        if (key === 'name') {
          const newName = form[key] as string;
          const parts = newName.split('/');
          if (parts.length === 3) {
            const [module, type, resource] = parts;
            push(`/configuration/${module}/${type}/${resource}`);
          }
        }
      } catch (error) {
        // Error notification
        dispatch(
          addNotification({
            message:
              error instanceof Error
                ? error.message
                : `Failed to save field "${key}"`,
            type: 'error',
          }),
        );

        // Revert form state on error
        setForm((prev) => ({ ...prev, [key]: originalData?.[key] }));
      }
    }
  };

  const saveMultiEnum = async (key: string) => {
    const oldArr = (originalData?.[key] as string[]) || [];
    const newArr = (form[key] as string[]) || [];
    const toAdd = newArr.filter((v) => !oldArr.includes(v));
    const toRemove = oldArr.filter((v) => !newArr.includes(v));

    try {
      for (const v of toAdd)
        await updateResourceWithOperation(node.name, {
          key,
          operation: addOp(v),
        });
      for (const v of toRemove)
        await updateResourceWithOperation(node.name, {
          key,
          operation: removeOp(v),
        });

      // Success notification
      dispatch(
        addNotification({
          message: t('fieldSaved', { field: key }),
          type: 'success',
        }),
      );
    } catch (error) {
      // Error notification
      dispatch(
        addNotification({
          message:
            error instanceof Error
              ? error.message
              : `Failed to save field "${key}"`,
          type: 'error',
        }),
      );

      // Revert form state on error
      setForm((prev) => ({ ...prev, [key]: originalData?.[key] }));
    }
  };

  const saveField = async (key: string) => {
    if (!isDirty(key)) return;
    if (Array.isArray(originalData?.[key]) || Array.isArray(form[key]))
      return saveMultiEnum(key);
    return saveScalar(key);
  };

  const cancelField = (key: string) =>
    setForm((prev) => ({ ...prev, [key]: originalData?.[key] }));

  return {
    form,
    onChange,
    isDirty,
    saveField,
    cancelField,
    originalData,
    resourceTree,
  };
}
