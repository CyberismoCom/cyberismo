/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { useEffect } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Autocomplete,
  Box,
  Divider,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Option,
  Select,
  Stack,
} from '@mui/joy';
import Add from '@mui/icons-material/Add';
import Check from '@mui/icons-material/Check';
import Delete from '@mui/icons-material/Delete';
import Edit from '@mui/icons-material/Edit';
import Search from '@mui/icons-material/Search';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { ExpandedLinkType } from '../../lib/definitions';
import type { CardResponse, Connector } from '../../lib/api/types';
import type {
  CalculationLink,
  LinkDirection,
  QueryResult,
} from '@cyberismo/data-handler/types/queries';
import {
  canCreateLinkToCard,
  createPredicate,
  findCard,
  flattenTree,
} from '../../lib/utils';
import { LinkRow } from './LinkRow';

export type LinkFormState = 'hidden' | 'add' | 'add-from-toolbar' | 'edit';

export interface LinkFormSubmitData {
  linkType: string;
  cardKey: string;
  linkDescription: string;
  direction: LinkDirection;
  // External link: connector name, empty string for card links
  connector: string;
  externalItemKey?: string;
  // Edit mode previous values
  previousLinkType?: string;
  previousCardKey?: string;
  previousLinkDescription?: string;
  previousDirection?: LinkDirection;
}

interface LinkFormData {
  linkType: number;
  connector: string;
  cardKey: string;
  externalItemKey: string;
  linkDescription: string;
}

interface LinkFormProps {
  linkTypes: ExpandedLinkType[];
  cards: QueryResult<'tree'>[];
  connectors?: Connector[];
  onSubmit?: (data: LinkFormSubmitData) => boolean | Promise<boolean>;
  cardKey: string;
  currentCardLinks: CalculationLink[];
  mode: 'add' | 'edit';
  data?: LinkFormData;
  inModal?: boolean;
  formRef?: RefObject<HTMLFormElement | null>;
  onDelete?: () => void;
  isLoading?: boolean;
  isUpdating?: boolean;
}

const NO_LINK_TYPE = -1;

const DEFAULT_LINK_FORM_DATA: LinkFormData = {
  linkType: NO_LINK_TYPE,
  connector: 'card',
  cardKey: '',
  externalItemKey: '',
  linkDescription: '',
};

export function LinkForm({
  cards,
  linkTypes,
  connectors,
  onSubmit,
  cardKey,
  currentCardLinks,
  data,
  mode,
  formRef,
  onDelete,
  isLoading,
  isUpdating,
}: LinkFormProps) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm<LinkFormData>({
    defaultValues: {
      ...DEFAULT_LINK_FORM_DATA,
      ...(data || {}),
    },
  });
  const { t } = useTranslation();

  const itemSources: { value: string; label: string }[] = [
    { value: 'card', label: t('linkForm.sourceCard') },
  ];
  if (connectors) {
    for (const connector of connectors) {
      itemSources.push({
        value: connector.name,
        label: connector.displayName,
      });
    }
  }

  useEffect(() => {
    reset({
      ...DEFAULT_LINK_FORM_DATA,
      ...(data || {}),
    });
  }, [data, reset]);

  const linkType = useWatch({ name: 'linkType', control });
  const connector = useWatch({ name: 'connector', control });

  const selectedLinkType = linkTypes.find((t) => t.id === linkType);

  const linksForFilter =
    mode === 'edit' && data?.cardKey
      ? currentCardLinks.filter((l) => l.key !== data.cardKey)
      : currentCardLinks;

  const usableCards = flattenTree(cards).filter(
    createPredicate(
      canCreateLinkToCard,
      cardKey,
      selectedLinkType,
      linksForFilter,
    ),
  );

  const formCardKey = useWatch({ name: 'cardKey', control });
  useEffect(() => {
    if (mode === 'edit' && data?.cardKey && formCardKey === data.cardKey) {
      return;
    }
    if (formCardKey && !usableCards.find((c) => c.key === formCardKey)) {
      reset({ ...DEFAULT_LINK_FORM_DATA, linkType, connector });
    }
  }, [formCardKey, usableCards, linkType, connector, reset, mode, data]);

  const isCardConnector = connector === 'card';

  const selectedConnector =
    isCardConnector || !connectors
      ? null
      : connectors.find((c) => c.name === connector) || null;

  const externalItems = selectedConnector?.items || [];

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit(async (formData) => {
        const linkType = linkTypes.find((t) => t.id === formData.linkType);
        if (!linkType) return;
        const success = await onSubmit?.({
          linkType: linkType.name,
          cardKey: formData.connector === 'card' ? formData.cardKey : '',
          linkDescription: formData.linkDescription,
          direction: linkType.direction,
          connector: formData.connector,
          externalItemKey:
            formData.connector !== 'card'
              ? formData.externalItemKey
              : undefined,
        });
        if (success) reset();
      })}
    >
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} alignItems="flex-end">
          <FormControl required>
            {mode === 'add' && <FormLabel>{t('linkForm.itemType')}</FormLabel>}
            <Controller
              name="linkType"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  placeholder={t('linkForm.selectLinkType')}
                  color="primary"
                  onChange={(_, value) => field.onChange(value)}
                  sx={{ width: 180 }}
                  required={true}
                >
                  {linkTypes.map((linkType) => (
                    <Option key={linkType.id} value={linkType.id}>
                      {linkType.direction === 'outbound'
                        ? linkType.outboundDisplayName
                        : linkType.inboundDisplayName}
                    </Option>
                  ))}
                </Select>
              )}
            />
          </FormControl>
          <FormControl required>
            {mode === 'add' && (
              <FormLabel>{t('linkForm.itemSource')}</FormLabel>
            )}
            <Controller
              name="connector"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  placeholder={t('linkForm.selectSource')}
                  color="primary"
                  onChange={(_, value) => field.onChange(value)}
                  sx={{ width: 180 }}
                  required={true}
                >
                  {itemSources.map((source) => (
                    <Option key={source.value} value={source.value}>
                      {source.label}
                    </Option>
                  ))}
                </Select>
              )}
            />
          </FormControl>
          <FormControl required sx={{ flexGrow: 1 }}>
            {mode === 'add' && (
              <FormLabel>{t('linkForm.searchItem')}</FormLabel>
            )}
            {isCardConnector ? (
              <Controller
                name="cardKey"
                control={control}
                render={({ field: { onChange, value } }) => (
                  <Autocomplete
                    color="primary"
                    required={true}
                    placeholder={t('linkForm.searchCard')}
                    options={usableCards.map((c) => ({
                      label: `${c.title} (${c.key})`,
                      value: c.key,
                    }))}
                    isOptionEqualToValue={(option, value) =>
                      option.value === value.value
                    }
                    onChange={(_, value) => onChange(value?.value || '')}
                    value={
                      value
                        ? {
                            label: `${findCard(cards, value)?.title}(${value})`,
                            value,
                          }
                        : null
                    }
                    startDecorator={<Search />}
                    sx={{ width: '100%' }}
                  />
                )}
              />
            ) : (
              <Controller
                name="externalItemKey"
                control={control}
                render={({ field: { onChange, value } }) => (
                  <Autocomplete
                    color="primary"
                    required={true}
                    placeholder={t('linkForm.searchExternalItem')}
                    options={externalItems.map((item) => ({
                      label: `${item.title} (${item.key})`,
                      value: item.key,
                    }))}
                    isOptionEqualToValue={(option, value) =>
                      option.value === value.value
                    }
                    onChange={(_, selected) => onChange(selected?.value || '')}
                    value={
                      value
                        ? {
                            label: `${externalItems.find((i) => i.key === value)?.title || value} (${value})`,
                            value,
                          }
                        : null
                    }
                    startDecorator={<Search />}
                    sx={{ width: '100%' }}
                  />
                )}
              />
            )}
          </FormControl>
          <Box my={0.5}>
            {mode === 'add' ? (
              <IconButton
                data-cy="addLinkButton"
                type="submit"
                size="sm"
                color="success"
                variant="soft"
                disabled={isLoading || !!isUpdating}
              >
                <Add />
              </IconButton>
            ) : isDirty ? (
              <IconButton
                type="submit"
                size="sm"
                color="primary"
                variant="soft"
                disabled={isLoading || !!isUpdating}
              >
                <Check />
              </IconButton>
            ) : (
              onDelete && (
                <IconButton
                  size="sm"
                  color="danger"
                  onClick={onDelete}
                  disabled={isLoading}
                >
                  <Delete data-cy="DeleteIcon" />
                </IconButton>
              )
            )}
          </Box>
        </Stack>

        {selectedLinkType?.enableLinkDescription && (
          <Stack
            direction="row"
            spacing={1}
            alignItems="flex-end"
            paddingRight={5}
          >
            <FormControl sx={{ flexGrow: 1 }}>
              {mode === 'add' && (
                <FormLabel>{t('linkForm.description')}</FormLabel>
              )}
              <Controller
                name="linkDescription"
                control={control}
                render={({ field }) => (
                  <Input
                    {...field}
                    color="primary"
                    startDecorator={<Edit />}
                    placeholder={t('linkForm.writeDescription')}
                  />
                )}
              />
            </FormControl>
          </Stack>
        )}
      </Stack>
    </form>
  );
}

type LinkRowEditProps = {
  link: CalculationLink;
  cards: QueryResult<'tree'>[];
  linkTypes: ExpandedLinkType[];
  connectors?: Connector[];
  cardKey: string;
  currentCardLinks: CalculationLink[];
  onSubmit: (data: LinkFormSubmitData) => Promise<boolean>;
  onDelete: () => void;
  isLoading: boolean;
  isUpdating: boolean;
};

function LinkRowEdit({
  link,
  cards,
  linkTypes,
  connectors,
  cardKey,
  currentCardLinks,
  onSubmit,
  onDelete,
  isLoading,
  isUpdating,
}: LinkRowEditProps) {
  return (
    <LinkForm
      cards={cards}
      linkTypes={linkTypes}
      connectors={connectors}
      onSubmit={onSubmit}
      cardKey={cardKey}
      currentCardLinks={currentCardLinks}
      mode="edit"
      data={{
        linkType:
          linkTypes.find(
            (lt) =>
              lt.name === link.linkType && lt.direction === link.direction,
          )?.id ?? -1,
        connector: link.connector ?? 'card',
        cardKey: link.connector ? '' : link.key,
        externalItemKey: link.connector ? link.key : '',
        linkDescription: link.linkDescription || '',
      }}
      onDelete={onDelete}
      isLoading={isLoading}
      isUpdating={isUpdating}
    />
  );
}

export type EditModeProps = {
  card: CardResponse;
  cards: QueryResult<'tree'>[];
  linkTypes: ExpandedLinkType[];
  connectors?: Connector[];
  onAddSubmit: (data: LinkFormSubmitData) => Promise<boolean>;
  onEditSubmit: (
    link: CalculationLink,
    data: LinkFormSubmitData,
  ) => Promise<boolean>;
  onDeleteLink: (link: CalculationLink) => void;
  isLoading: boolean;
  isAddUpdating: boolean;
  isEditUpdating: boolean;
};

export function EditMode({
  card,
  cards,
  linkTypes,
  connectors,
  onAddSubmit,
  onEditSubmit,
  onDeleteLink,
  isLoading,
  isAddUpdating,
  isEditUpdating,
}: EditModeProps) {
  return (
    <Stack spacing={2}>
      <LinkForm
        cards={cards}
        linkTypes={linkTypes}
        connectors={connectors}
        onSubmit={onAddSubmit}
        cardKey={card.key}
        currentCardLinks={card.links}
        mode="add"
        isLoading={isLoading}
        isUpdating={isAddUpdating}
      />
      {card.links.length > 0 && <Divider sx={{ my: 1 }} />}
      {card.links.map((link, index) =>
        link.linkSource === 'user' ? (
          <LinkRowEdit
            key={link.key + index}
            link={link}
            cards={cards}
            linkTypes={linkTypes}
            connectors={connectors}
            cardKey={card.key}
            currentCardLinks={card.links}
            onSubmit={(data) => onEditSubmit(link, data)}
            onDelete={() => onDeleteLink(link)}
            isLoading={isLoading}
            isUpdating={isEditUpdating}
          />
        ) : (
          <LinkRow key={link.key + index} link={link} />
        ),
      )}
    </Stack>
  );
}
