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

import { isResourceNode, ResourceNode } from '@/lib/api/types';
import { Stack, Table, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import BaseEditor from './BaseEditor';
import { useValidateResource } from '@/lib/api/validate';
import { ChecksAccordion, type CheckCollection } from '../ChecksAccordion';

export function ResourceEditor({ node }: { node: ResourceNode }) {
  const { t } = useTranslation();
  const { validateResource } = useValidateResource(node.name);

  if (!isResourceNode(node)) {
    return (
      <div>Attempted to render a non-resource node as a resource editor.</div>
    );
  }

  // Extract data from the node
  const data = 'data' in node ? node.data : {};

  // Convert the data object to an array of key-value pairs for table display
  const tableData = Object.entries(data).map(([key, value]) => ({
    key,
    value:
      typeof value === 'object' && value !== null
        ? JSON.stringify(value, null, 4)
        : String(value),
  }));

  const validationChecks: CheckCollection = {
    successes: [],
    failures: validateResource
      ? validateResource.errors.map((error) => ({
          category: '',
          title: t('validationError'),
          errorMessage: error,
        }))
      : [],
  };

  return (
    <BaseEditor
      node={node}
      onUpdate={() => {}}
      isUpdating={false}
      enabled={{
        delete: true,
        logicProgram: !['calculations', 'graphModels', 'graphViews'].includes(
          node.type,
        ),
      }}
    >
      <Typography level="h3" sx={{ mb: 2 }}>
        {node.name}
      </Typography>

      <Stack direction="row" spacing={2}>
        <Table>
          <thead>
            <tr>
              <th style={{ width: '30%' }}>Property</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map(({ key, value }) => (
              <tr key={key}>
                <td>
                  <Typography fontWeight="bold">{key}</Typography>
                </td>
                <td>
                  <Typography
                    sx={{
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {value}
                  </Typography>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>

        {validateResource && (
          <ChecksAccordion
            checks={validationChecks}
            cardKey={node.name}
            successTitle=""
            failureTitle={t('validationErrors')}
            successPassText=""
            failureFailText={t('invalid')}
            showGoToField={false}
            initialSuccessesExpanded={false}
            initialFailuresExpanded={true}
          />
        )}
      </Stack>
    </BaseEditor>
  );
}
