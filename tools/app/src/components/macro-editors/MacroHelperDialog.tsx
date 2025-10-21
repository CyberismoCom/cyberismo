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

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Modal,
  ModalDialog,
  Option,
  Select,
  Stack,
  Tooltip,
  Typography,
} from '@mui/joy';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { useTranslation } from 'react-i18next';
import type { AnyMacroOption, MacroName } from '@cyberismo/data-handler';
import type {
  GraphView,
  TemplateConfiguration,
} from '@cyberismo/data-handler/interfaces/resource-interfaces';

import { useTree } from '@/lib/api/tree';
import { useResourceTree } from '@/lib/api/resources';
import { useTemplates } from '@/lib/api/templates';
import { flattenTree } from '@/lib/utils';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';
import type { AnyNode, NodeKey } from '@/lib/api/types';

export type MacroHelperName = Extract<
  MacroName,
  'include' | 'xref' | 'createCards' | 'report' | 'graph'
>;

export interface MacroHelperDialogProps {
  macro: MacroHelperName | null;
  onClose: () => void;
  onInsert: (macro: MacroHelperName, options: AnyMacroOption) => void;
}

type CardOption = {
  label: string;
  value: string;
};

interface MacroModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitDisabled?: boolean;
  children: ReactNode;
  loading?: boolean;
}

const DEFAULT_MODAL_WIDTH = 440;

function MacroModal({
  open,
  title,
  onClose,
  onSubmit,
  submitDisabled = false,
  children,
  loading = false,
}: MacroModalProps) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog
        aria-labelledby="macro-helper-dialog-title"
        sx={{
          minWidth: DEFAULT_MODAL_WIDTH,
        }}
      >
        <DialogTitle id="macro-helper-dialog-title">{title}</DialogTitle>
        <Divider />
        <DialogContent>
          {loading ? (
            <Box
              display="flex"
              justifyContent="center"
              alignItems="center"
              py={2}
            >
              <CircularProgress size="sm" color="primary" />
            </Box>
          ) : (
            children
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="plain" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={onSubmit} disabled={submitDisabled}>
            {t('asciiDocEditor.macros.insert')}
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}

function collectResourceNodes<T extends NodeKey>(
  nodes: AnyNode[] | undefined,
  type: T,
) {
  if (!nodes) return [] as Extract<AnyNode, { type: T }>[];

  const result: Extract<AnyNode, { type: T }>[] = [];
  const walk = (items: AnyNode[]) => {
    items.forEach((item) => {
      if (item.type === type) {
        result.push(item as Extract<AnyNode, { type: T }>);
      }
      if (item.children) {
        walk(item.children);
      }
    });
  };

  walk(nodes);
  return result;
}

function useCardOptions() {
  const { tree, isLoading } = useTree();

  const options = useMemo<CardOption[]>(() => {
    const flattened: QueryResult<'tree'>[] = flattenTree(tree ?? []);
    return flattened.map((card) => ({
      label: `${card.title} (${card.key})`,
      value: card.key,
    }));
  }, [tree]);

  return { options, isLoading };
}

interface IncludeMacroDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (options: IncludeMacroOptions) => void;
}

function IncludeMacroDialog({
  open,
  onClose,
  onInsert,
}: IncludeMacroDialogProps) {
  const { t } = useTranslation();
  const { options: cardOptions, isLoading } = useCardOptions();

  const [selectedCard, setSelectedCard] = useState<string>('');
  const [levelOffset, setLevelOffset] = useState<string>('');
  const [titleOption, setTitleOption] = useState<
    IncludeMacroOptions['title'] | ''
  >('');
  const [pageTitlesOption, setPageTitlesOption] = useState<
    IncludeMacroOptions['pageTitles'] | ''
  >('');

  useEffect(() => {
    if (!open) {
      setSelectedCard('');
      setLevelOffset('');
      setTitleOption('');
      setPageTitlesOption('');
    }
  }, [open]);

  const handleSubmit = () => {
    if (!selectedCard) return;
    const payload: Record<string, unknown> = {
      cardKey: selectedCard,
    };
    if (levelOffset.trim()) {
      payload.levelOffset = levelOffset.trim();
    }
    if (titleOption) {
      payload.title = titleOption;
    }
    if (pageTitlesOption) {
      payload.pageTitles = pageTitlesOption;
    }

    onInsert(payload as IncludeMacroOptions);
    onClose();
  };

  const selectedCardOption =
    cardOptions.find((option) => option.value === selectedCard) ?? null;

  return (
    <MacroModal
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitDisabled={!selectedCard}
      title={t('asciiDocEditor.macros.include.title')}
      loading={isLoading}
    >
      <Stack spacing={2}>
        <FormControl required>
          <FormLabel>{t('asciiDocEditor.macros.include.cardLabel')}</FormLabel>
          <Autocomplete
            placeholder={t('asciiDocEditor.macros.include.cardPlaceholder')}
            options={cardOptions}
            value={selectedCardOption}
            onChange={(_, value) => setSelectedCard(value?.value || '')}
            getOptionLabel={(option) => option.label}
            isOptionEqualToValue={(option, value) =>
              option.value === value.value
            }
          />
          {cardOptions.length === 0 && !isLoading && (
            <FormHelperText>
              {t('asciiDocEditor.macros.common.noCards')}
            </FormHelperText>
          )}
        </FormControl>

        <FormControl>
          <FormLabel>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography level="body-sm">
                {t('asciiDocEditor.macros.include.levelOffset')}
              </Typography>
              <Tooltip
                placement="top"
                title={t('asciiDocEditor.macros.include.levelOffsetTooltip')}
              >
                <InfoOutlined fontSize="small" />
              </Tooltip>
            </Stack>
          </FormLabel>
          <Input
            value={levelOffset}
            onChange={(event) => setLevelOffset(event.target.value)}
            placeholder={t(
              'asciiDocEditor.macros.include.levelOffsetPlaceholder',
            )}
          />
        </FormControl>

        <FormControl>
          <FormLabel>
            {t('asciiDocEditor.macros.include.includeTitle')}
          </FormLabel>
          <Select
            placeholder={t(
              'asciiDocEditor.macros.include.includeTitlePlaceholder',
            )}
            value={titleOption || null}
            onChange={(_, value) =>
              setTitleOption((value as IncludeMacroOptions['title']) || '')
            }
          >
            <Option value="include">
              {t('asciiDocEditor.macros.include.includeTitleOptions.include')}
            </Option>
            <Option value="exclude">
              {t('asciiDocEditor.macros.include.includeTitleOptions.exclude')}
            </Option>
            <Option value="only">
              {t('asciiDocEditor.macros.include.includeTitleOptions.only')}
            </Option>
          </Select>
        </FormControl>

        <FormControl>
          <FormLabel>{t('asciiDocEditor.macros.include.pageTitles')}</FormLabel>
          <Select
            placeholder={t(
              'asciiDocEditor.macros.include.pageTitlesPlaceholder',
            )}
            value={pageTitlesOption || null}
            onChange={(_, value) =>
              setPageTitlesOption(
                (value as IncludeMacroOptions['pageTitles']) || '',
              )
            }
          >
            <Option value="normal">
              {t('asciiDocEditor.macros.include.pageTitlesOptions.normal')}
            </Option>
            <Option value="discrete">
              {t('asciiDocEditor.macros.include.pageTitlesOptions.discrete')}
            </Option>
          </Select>
        </FormControl>
      </Stack>
    </MacroModal>
  );
}

interface XrefMacroDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (options: XrefMacroOptions) => void;
}

function XrefMacroDialog({ open, onClose, onInsert }: XrefMacroDialogProps) {
  const { t } = useTranslation();
  const { options: cardOptions, isLoading } = useCardOptions();
  const [selectedCard, setSelectedCard] = useState<string>('');

  useEffect(() => {
    if (!open) {
      setSelectedCard('');
    }
  }, [open]);

  const handleSubmit = () => {
    if (!selectedCard) return;
    onInsert({ cardKey: selectedCard });
    onClose();
  };

  const selectedOption =
    cardOptions.find((option) => option.value === selectedCard) ?? null;

  return (
    <MacroModal
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitDisabled={!selectedCard}
      title={t('asciiDocEditor.macros.xref.title')}
      loading={isLoading}
    >
      <Stack spacing={2}>
        <FormControl required>
          <FormLabel>{t('asciiDocEditor.macros.xref.cardLabel')}</FormLabel>
          <Autocomplete
            placeholder={t('asciiDocEditor.macros.xref.cardPlaceholder')}
            options={cardOptions}
            value={selectedOption}
            onChange={(_, value) => setSelectedCard(value?.value || '')}
            getOptionLabel={(option) => option.label}
            isOptionEqualToValue={(option, value) =>
              option.value === value.value
            }
          />
          {cardOptions.length === 0 && !isLoading && (
            <FormHelperText>
              {t('asciiDocEditor.macros.common.noCards')}
            </FormHelperText>
          )}
        </FormControl>
      </Stack>
    </MacroModal>
  );
}

interface CreateCardsMacroDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (options: CreateCardsOptions) => void;
}

function CreateCardsMacroDialog({
  open,
  onClose,
  onInsert,
}: CreateCardsMacroDialogProps) {
  const { t } = useTranslation();
  const { templates, isLoading } = useTemplates();

  const templateOptions = useMemo(
    () =>
      (templates ?? []).map((template: TemplateConfiguration) => ({
        id: template.name,
        displayName: template.displayName || template.name,
      })),
    [templates],
  );

  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [buttonLabel, setButtonLabel] = useState<string>('');
  const [buttonTouched, setButtonTouched] = useState<boolean>(false);

  useEffect(() => {
    if (!open) {
      setSelectedTemplate('');
      setButtonLabel('');
      setButtonTouched(false);
    }
  }, [open]);

  useEffect(() => {
    if (!buttonTouched && selectedTemplate) {
      const template = templateOptions.find(
        (option) => option.id === selectedTemplate,
      );
      if (template) {
        setButtonLabel(`${t('create')} ${template.displayName}`);
      }
    }
  }, [buttonTouched, selectedTemplate, templateOptions, t]);

  const handleSubmit = () => {
    if (!selectedTemplate || !buttonLabel.trim()) return;
    onInsert({
      template: selectedTemplate,
      buttonLabel: buttonLabel.trim(),
    });
    onClose();
  };

  return (
    <MacroModal
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitDisabled={!selectedTemplate || !buttonLabel.trim()}
      title={t('asciiDocEditor.macros.createCards.title')}
      loading={isLoading && !templates}
    >
      <Stack spacing={2}>
        <FormControl required>
          <FormLabel>
            {t('asciiDocEditor.macros.createCards.templateLabel')}
          </FormLabel>
          <Select
            placeholder={t(
              'asciiDocEditor.macros.createCards.templatePlaceholder',
            )}
            value={selectedTemplate || null}
            onChange={(_, value) =>
              setSelectedTemplate((value as string) || '')
            }
          >
            {templateOptions.map((template) => (
              <Option key={template.id} value={template.id}>
                {template.displayName}
              </Option>
            ))}
          </Select>
          {templateOptions.length === 0 && !isLoading && (
            <FormHelperText>
              {t('asciiDocEditor.macros.common.noTemplates')}
            </FormHelperText>
          )}
        </FormControl>

        <FormControl required>
          <FormLabel>
            {t('asciiDocEditor.macros.createCards.buttonLabel')}
          </FormLabel>
          <Input
            value={buttonLabel}
            onChange={(event) => {
              if (!buttonTouched) setButtonTouched(true);
              setButtonLabel(event.target.value);
            }}
            placeholder={t(
              'asciiDocEditor.macros.createCards.buttonPlaceholder',
            )}
          />
          <FormHelperText>
            {t('asciiDocEditor.macros.createCards.buttonHelper')}
          </FormHelperText>
        </FormControl>
      </Stack>
    </MacroModal>
  );
}

interface ReportMacroDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (options: ReportOptions) => void;
}

function ReportMacroDialog({
  open,
  onClose,
  onInsert,
}: ReportMacroDialogProps) {
  const { t } = useTranslation();
  const { resourceTree, isLoading } = useResourceTree();

  const reportNodes = useMemo(
    () => collectResourceNodes(resourceTree, 'reports'),
    [resourceTree],
  );

  const [selectedReport, setSelectedReport] = useState<string>('');

  useEffect(() => {
    if (!open) {
      setSelectedReport('');
    }
  }, [open]);

  const handleSubmit = () => {
    if (!selectedReport) return;
    onInsert({ name: selectedReport });
    onClose();
  };

  return (
    <MacroModal
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitDisabled={!selectedReport}
      title={t('asciiDocEditor.macros.report.title')}
      loading={isLoading && !resourceTree}
    >
      <Stack spacing={2}>
        <FormControl required>
          <FormLabel>{t('asciiDocEditor.macros.report.reportLabel')}</FormLabel>
          <Select
            placeholder={t('asciiDocEditor.macros.report.reportPlaceholder')}
            value={selectedReport || null}
            onChange={(_, value) => setSelectedReport((value as string) || '')}
          >
            {reportNodes.map((node) => (
              <Option key={node.name} value={node.data.name}>
                {node.data.displayName || node.data.name}
              </Option>
            ))}
          </Select>
          {reportNodes.length === 0 && !isLoading && (
            <FormHelperText>
              {t('asciiDocEditor.macros.common.noReports')}
            </FormHelperText>
          )}
        </FormControl>
      </Stack>
    </MacroModal>
  );
}

interface GraphMacroDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (options: GraphOptions & Record<string, unknown>) => void;
}

function GraphMacroDialog({ open, onClose, onInsert }: GraphMacroDialogProps) {
  const { t } = useTranslation();
  const { resourceTree, isLoading } = useResourceTree();

  const graphViewNodes = useMemo(
    () => collectResourceNodes(resourceTree, 'graphViews'),
    [resourceTree],
  );

  const graphModelNodes = useMemo(
    () => collectResourceNodes(resourceTree, 'graphModels'),
    [resourceTree],
  );

  const [selectedGraphView, setSelectedGraphView] = useState<string>('');
  const [selectedGraphModel, setSelectedGraphModel] = useState<string>('');
  const [modelTouched, setModelTouched] = useState<boolean>(false);

  useEffect(() => {
    if (!open) {
      setSelectedGraphView('');
      setSelectedGraphModel('');
      setModelTouched(false);
    }
  }, [open]);

  const selectedViewNode = useMemo(() => {
    return graphViewNodes.find((node) => node.data.name === selectedGraphView);
  }, [graphViewNodes, selectedGraphView]);

  useEffect(() => {
    if (!selectedViewNode) {
      setSelectedGraphModel('');
      setModelTouched(false);
      return;
    }

    const graphView = selectedViewNode.data as GraphView & {
      content?: GraphView['content'] & { schema?: Schema };
    };
    const schema = graphView.content?.schema as
      | SchemaWithProperties
      | undefined;
    if (!modelTouched) {
      const schemaModel =
        schema &&
        typeof schema === 'object' &&
        schema.properties &&
        !Array.isArray(schema.properties)
          ? schema.properties.model
          : undefined;
      if (schemaModel && typeof schemaModel !== 'boolean') {
        if (schemaModel.default && typeof schemaModel.default === 'string') {
          setSelectedGraphModel(schemaModel.default);
          return;
        }
      }
      setSelectedGraphModel('');
    }
  }, [selectedViewNode, modelTouched]);

  const handleSubmit = () => {
    if (!selectedGraphView || !selectedGraphModel) return;
    const payload: Record<string, unknown> = {
      model: selectedGraphModel,
      view: selectedGraphView,
    };
    onInsert(payload as GraphOptions & Record<string, unknown>);
    onClose();
  };

  return (
    <MacroModal
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitDisabled={!selectedGraphView || !selectedGraphModel}
      title={t('asciiDocEditor.macros.graph.title')}
      loading={isLoading && !resourceTree}
    >
      <Stack spacing={2}>
        <FormControl required>
          <FormLabel>{t('asciiDocEditor.macros.graph.viewLabel')}</FormLabel>
          <Select
            placeholder={t('asciiDocEditor.macros.graph.viewPlaceholder')}
            value={selectedGraphView || null}
            onChange={(_, value) => {
              setSelectedGraphView((value as string) || '');
              setModelTouched(false);
            }}
          >
            {graphViewNodes.map((node) => (
              <Option key={node.name} value={node.data.name}>
                {node.data.displayName || node.data.name}
              </Option>
            ))}
          </Select>
          {graphViewNodes.length === 0 && !isLoading && (
            <FormHelperText>
              {t('asciiDocEditor.macros.common.noGraphViews')}
            </FormHelperText>
          )}
        </FormControl>

        <FormControl required>
          <FormLabel>{t('asciiDocEditor.macros.graph.modelLabel')}</FormLabel>
          <Select
            placeholder={t('asciiDocEditor.macros.graph.modelPlaceholder')}
            value={selectedGraphModel || null}
            onChange={(_, value) => {
              setSelectedGraphModel((value as string) || '');
              setModelTouched(true);
            }}
          >
            {graphModelNodes.map((node) => (
              <Option key={node.name} value={node.data.name}>
                {node.data.displayName || node.data.name}
              </Option>
            ))}
          </Select>
          {graphModelNodes.length === 0 && !isLoading && (
            <FormHelperText>
              {t('asciiDocEditor.macros.common.noGraphModels')}
            </FormHelperText>
          )}
        </FormControl>
      </Stack>
    </MacroModal>
  );
}

export function MacroHelperDialog({
  macro,
  onClose,
  onInsert,
}: MacroHelperDialogProps) {
  if (!macro) {
    return null;
  }

  if (macro === 'include') {
    return (
      <IncludeMacroDialog
        open
        onClose={onClose}
        onInsert={(options) => onInsert('include', options)}
      />
    );
  }
  if (macro === 'xref') {
    return (
      <XrefMacroDialog
        open
        onClose={onClose}
        onInsert={(options) => onInsert('xref', options)}
      />
    );
  }
  if (macro === 'createCards') {
    return (
      <CreateCardsMacroDialog
        open
        onClose={onClose}
        onInsert={(options) => onInsert('createCards', options)}
      />
    );
  }
  if (macro === 'report') {
    return (
      <ReportMacroDialog
        open
        onClose={onClose}
        onInsert={(options) => onInsert('report', options as AnyMacroOption)}
      />
    );
  }
  if (macro === 'graph') {
    return (
      <GraphMacroDialog
        open
        onClose={onClose}
        onInsert={(options) => onInsert('graph', options as AnyMacroOption)}
      />
    );
  }
  return null;
}

export default MacroHelperDialog;
