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

import type { ResourceNode } from '@/lib/api/types';
import { isResourceNode } from '@/lib/api/types';
import { Stack, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import BaseEditor from './BaseEditor';
import { useValidateResource } from '@/lib/api/validate';
import { ChecksAccordion, type CheckCollection } from '../ChecksAccordion';
import { useResourceEditorHelpers } from '../../lib/hooks/configurationEditor';
import {
  BooleanInput,
  CardTypeFieldsEditor,
  EnumValuesEditor,
  IdentifierInput,
  MultiSelectInput,
  TextareaInput,
  TextInput,
  SelectInput,
  WorkflowStatesEditor,
} from './fields';
import type {
  FieldType,
  Workflow,
} from '@cyberismo/data-handler/interfaces/resource-interfaces';
import FieldRow from './fields/FieldRow';
import { resourceFieldConfigs, type FieldConfig } from './resourceFieldConfigs';
import { FORM_FIELD_MAX_WIDTH } from '@/lib/constants';

export function ResourceEditor({ node }: { node: ResourceNode }) {
  const { t } = useTranslation();
  const { validateResource } = useValidateResource(node.name);
  const editor = useResourceEditorHelpers(node);

  if (!isResourceNode(node) || !('data' in node)) {
    return (
      <div>Attempted to render a non-resource node as a resource editor.</div>
    );
  }

  const fieldConfigs = resourceFieldConfigs[node.type] || [];
  const constrainedConfigs = fieldConfigs.filter((c) => !c.fullWidth);
  const fullWidthConfigs = fieldConfigs.filter((c) => c.fullWidth);

  const renderField = (config: FieldConfig) => {
    const { key, type, label, options, staticOptions } = config;
    const fieldOptions = options
      ? options(editor.resourceTree || [], node)
      : staticOptions || [];
    const labelText = t(label);
    const parts = node.name.split('/');
    if (parts.length < 3) {
      // Shouldn't happen
      console.warn('Received unexpected name', node.name);
      return null;
    }

    switch (type) {
      case 'identifier':
        return (
          <IdentifierInput
            label={labelText}
            prefix={parts[0]}
            type={node.type}
            value={String(editor.form[key] ?? '')}
            onChange={(v) => editor.onChange(key, v)}
          />
        );
      case 'text':
        return (
          <TextInput
            label={labelText}
            value={String(editor.form[key] ?? '')}
            onChange={(v) => editor.onChange(key, v)}
          />
        );
      case 'textarea':
        return (
          <TextareaInput
            label={labelText}
            value={String(editor.form[key] ?? '')}
            onChange={(v) => editor.onChange(key, v)}
          />
        );
      case 'select':
        return (
          <SelectInput
            label={labelText}
            value={String(editor.form[key] ?? '')}
            options={fieldOptions}
            onChange={(v) => editor.onChange(key, v)}
          />
        );
      case 'multiselect':
        return (
          <MultiSelectInput
            label={labelText}
            value={(editor.form[key] as string[]) || []}
            options={fieldOptions}
            onChange={(v) => editor.onChange(key, v)}
          />
        );
      case 'boolean':
        return (
          <BooleanInput
            label={labelText}
            value={Boolean(editor.form[key])}
            onChange={(v) => editor.onChange(key, v)}
          />
        );
      case 'cardFields':
        return (
          <CardTypeFieldsEditor
            cardType={node.data as never}
            resourceTree={editor.resourceTree || []}
            readOnly={node.readOnly}
          />
        );
      case 'enumValues':
        return (
          <EnumValuesEditor
            fieldType={node.data as FieldType}
            readOnly={node.readOnly}
          />
        );
      case 'workflowStates':
        return (
          <WorkflowStatesEditor
            workflow={node.data as Workflow}
            readOnly={node.readOnly}
          />
        );
      default:
        return null;
    }
  };

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

      {/* Constrained width fields */}
      <Stack
        direction="column"
        spacing={2}
        sx={{ maxWidth: FORM_FIELD_MAX_WIDTH }}
      >
        {constrainedConfigs.map((config) =>
          config.type === 'cardFields' ||
          config.type === 'enumValues' ||
          config.type === 'workflowStates' ? (
            <div key={config.key}>{renderField(config)}</div>
          ) : (
            <FieldRow
              key={config.key}
              dirty={editor.isDirty(config.key)}
              onSave={() => editor.saveField(config.key)}
              onCancel={() => editor.cancelField(config.key)}
            >
              {renderField(config)}
            </FieldRow>
          ),
        )}

        {/* Validation */}
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

      {/* Full width fields (no maxWidth constraint) */}
      {fullWidthConfigs.map((config) => (
        <div key={config.key}>{renderField(config)}</div>
      ))}
    </BaseEditor>
  );
}
