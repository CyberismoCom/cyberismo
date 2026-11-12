// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  FormControl,
  FormLabel,
  Input,
  Option,
  Radio,
  RadioGroup,
  Select,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { CODE_MIRROR_CONFIG_PROPS, CODE_MIRROR_THEMES } from '@/lib/constants';
import { useIsDarkMode } from '@/lib/hooks';
import { useLinkTypes } from '@/lib/api/linkTypes';
import type { CreateLinksOptions } from '@cyberismo/model';
import { BaseMacroModal } from '../shared/MacroModal';
import {
  DEFAULT_CREATE_LINKS_FORM_VALUES,
  type MacroModalProps,
} from '../shared/types';

/**
 * The macro options from the form: trimmed, with empty optional fields left
 * out and the description kept only for link types that take one.
 */
export function toCreateLinksOptions(
  data: typeof DEFAULT_CREATE_LINKS_FORM_VALUES,
  allowsDescription: boolean,
): CreateLinksOptions {
  const linkDescription = data.linkDescription.trim();
  const buttonLabel = data.buttonLabel.trim();
  return {
    linkType: data.linkType,
    direction: data.direction,
    ...(allowsDescription && linkDescription ? { linkDescription } : {}),
    ...(buttonLabel ? { buttonLabel } : {}),
    query: data.query,
  };
}

export function CreateLinksMacroModal({
  open,
  onClose,
  onInsert,
}: MacroModalProps<CreateLinksOptions>) {
  const { t } = useTranslation();
  const isDarkMode = useIsDarkMode();
  const { linkTypes } = useLinkTypes();
  // CodeMirror's editable element is not a labelable input
  const queryLabel = t('asciiDocEditor.macros.createLinks.queryLabel');
  const queryExtensions = useMemo(
    () => [EditorView.contentAttributes.of({ 'aria-label': queryLabel })],
    [queryLabel],
  );

  const { control, handleSubmit, reset } = useForm({
    defaultValues: DEFAULT_CREATE_LINKS_FORM_VALUES,
  });

  useEffect(() => {
    if (!open) {
      reset({ ...DEFAULT_CREATE_LINKS_FORM_VALUES });
    }
  }, [open, reset]);

  const linkType = useWatch({ name: 'linkType', control });
  const query = useWatch({ name: 'query', control });
  const allowsDescription = (linkTypes ?? []).some(
    (type) => type.name === linkType && type.enableLinkDescription,
  );

  const handleModalSubmit = handleSubmit((data) => {
    if (!data.linkType || !data.query.trim()) return;
    onInsert(toCreateLinksOptions(data, allowsDescription));
    onClose();
  });

  return (
    <BaseMacroModal
      open={open}
      onClose={onClose}
      onSubmit={handleModalSubmit}
      dialogSx={{ width: { xs: '95vw', sm: 'min(720px, 90vw)' } }}
      submitDisabled={!linkType || !query.trim()}
      title={t('asciiDocEditor.macros.createLinks.title')}
    >
      <FormControl required>
        <FormLabel>
          {t('asciiDocEditor.macros.createLinks.linkTypeLabel')}
        </FormLabel>
        <Controller
          name="linkType"
          control={control}
          render={({ field }) => (
            <Select
              placeholder={t(
                'asciiDocEditor.macros.createLinks.linkTypePlaceholder',
              )}
              value={field.value || null}
              onChange={(_, value) => field.onChange((value as string) || '')}
            >
              {(linkTypes ?? []).map((type) => (
                <Option key={type.name} value={type.name}>
                  {type.name}
                </Option>
              ))}
            </Select>
          )}
        />
      </FormControl>

      <FormControl>
        <FormLabel>
          {t('asciiDocEditor.macros.createLinks.directionLabel')}
        </FormLabel>
        <Controller
          name="direction"
          control={control}
          render={({ field }) => (
            <RadioGroup
              orientation="horizontal"
              value={field.value}
              onChange={(e) => field.onChange(e.target.value)}
            >
              <Radio
                value="outbound"
                label={t('asciiDocEditor.macros.createLinks.directionOutbound')}
              />
              <Radio
                value="inbound"
                label={t('asciiDocEditor.macros.createLinks.directionInbound')}
              />
            </RadioGroup>
          )}
        />
      </FormControl>

      {allowsDescription && (
        <FormControl>
          <FormLabel>
            {t('asciiDocEditor.macros.createLinks.linkDescriptionLabel')}
          </FormLabel>
          <Controller
            name="linkDescription"
            control={control}
            render={({ field }) => <Input {...field} />}
          />
        </FormControl>
      )}

      <FormControl>
        <FormLabel>
          {t('asciiDocEditor.macros.createLinks.buttonLabel')}
        </FormLabel>
        <Controller
          name="buttonLabel"
          control={control}
          render={({ field }) => <Input {...field} />}
        />
      </FormControl>

      <FormControl required>
        <FormLabel>{queryLabel}</FormLabel>
        <Controller
          name="query"
          control={control}
          render={({ field }) => (
            <CodeMirror
              {...CODE_MIRROR_CONFIG_PROPS}
              theme={
                isDarkMode ? CODE_MIRROR_THEMES.dark : CODE_MIRROR_THEMES.light
              }
              extensions={queryExtensions}
              minHeight="160px"
              maxHeight="320px"
              placeholder={t(
                'asciiDocEditor.macros.createLinks.queryPlaceholder',
              )}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </FormControl>
    </BaseMacroModal>
  );
}

export default CreateLinksMacroModal;
