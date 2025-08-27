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

import CodeMirror from '@uiw/react-codemirror';
import { CalculationNode } from '@/lib/api/types';
import { useEffect, useState } from 'react';
import BaseEditor from './BaseEditor';
import { addNotification } from '@/lib/slices/notifications';
import { useAppDispatch } from '@/lib/hooks';
import { useTranslation } from 'react-i18next';
import { updateCalculation } from '@/lib/api/calculation';
import { CODE_MIRROR_BASE_PROPS } from '@/lib/constants';

export function CalculationEditor({ node }: { node: CalculationNode }) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const [calculation, setCalculation] = useState(node.data.calculation);

  useEffect(() => {
    setCalculation(node.data.calculation);
  }, [node.data.calculation]);

  return (
    <BaseEditor
      node={node}
      onUpdate={async () => {
        try {
          await updateCalculation(node.name, calculation);
          dispatch(
            addNotification({
              message: t('saveFile.success'),
              type: 'success',
            }),
          );
        } catch (error) {
          dispatch(
            addNotification({
              message: error instanceof Error ? error.message : '',
              type: 'error',
            }),
          );
        }
      }}
      isUpdating={false}
    >
      <CodeMirror
        {...CODE_MIRROR_BASE_PROPS}
        readOnly={node.readOnly}
        value={calculation}
        onChange={(value) => setCalculation(value)}
      />
    </BaseEditor>
  );
}
