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

import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Stack } from '@mui/joy';
import { useTheme } from '@mui/material/styles';
import { useMediaQuery } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { useCardMutations, useResourceTree } from '@/lib/api';
import CardToolbar from '@/components/toolbar/CardToolbar';
import { AttachmentPanel } from '@/components/card/AttachmentPanel';
import type { AnyNode, CardResponse } from '@/lib/api/types';
import type { MetadataValue } from '@/lib/definitions';
import { findCardParentInResourceTree, metadataValuesEqual } from '@/lib/utils';
import { UserRole, useHasMinRole } from '@/lib/auth';
import { useAppDispatch, useAppRouter } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import { isEdited } from '@/lib/slices/pageState';
import { parseContent } from '@/lib/api/actions/card';

import { TITLE_KEY, LABELS_KEY, buildDraft } from './draft';
import { TitleEditor } from './TitleEditor';
import { MetadataFields } from './MetadataFields';
import { ContentEditor, type ContentEditorHandle } from './ContentEditor';
import { TemplateCardPreview } from './TemplateCardPreview';
import { PreviewToggle } from './PreviewToggle';

/**
 * Edit-first editor for a single template (configuration) card. A working draft
 * held here is the single source of truth for both editing and Preview, so
 * per-field Cancel and tab toggles never desync. Title, labels, each field and
 * the content save independently. Template cards have no links.
 */
export function TemplateCardEditor({
  node,
  card,
}: {
  node: AnyNode;
  card: CardResponse;
}) {
  const { updateCard } = useCardMutations(node.id);
  const { resourceTree } = useResourceTree();
  const router = useAppRouter();
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down('lg'), {
    noSsr: true,
  });

  // Editing template (configuration) cards requires the Admin role.
  const isAdmin = useHasMinRole(UserRole.Admin);
  const editable = !node?.readOnly && isAdmin;
  const [isPreview, setIsPreview] = useState(false);

  const [draft, setDraft] = useState<Record<string, MetadataValue>>(() =>
    buildDraft(card),
  );
  const [content, setContent] = useState(card.rawContent ?? '');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const contentRef = useRef<ContentEditorHandle>(null);

  const savedDraft = useMemo(() => buildDraft(card), [card]);
  const titleDenied = (card.deniedOperations.editField ?? [])
    .map((f) => f.fieldName)
    .includes('title');

  const titleDirty = !metadataValuesEqual(
    draft[TITLE_KEY],
    savedDraft[TITLE_KEY],
  );
  const contentDirty = content !== (card.rawContent ?? '');
  const anyDirty =
    contentDirty ||
    Object.keys(savedDraft).some(
      (k) => !metadataValuesEqual(draft[k], savedDraft[k]),
    );

  // Surface unsaved state for the navigation guard.
  useEffect(() => {
    dispatch(isEdited(anyDirty));
    return () => {
      dispatch(isEdited(false));
    };
  }, [anyDirty, dispatch]);

  // Parse the (unsaved) content for the Preview tab.
  useEffect(() => {
    if (!isPreview) return;
    let mounted = true;
    parseContent(node.id, content).then((html) => {
      if (mounted) setPreviewHtml(html);
    });
    return () => {
      mounted = false;
    };
  }, [isPreview, content, node.id]);

  const setField = (key: string, value: MetadataValue) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const notifyError = (error: unknown) =>
    dispatch(
      addNotification({
        message: error instanceof Error ? error.message : '',
        type: 'error',
      }),
    );

  const saveMetadata = async (metadataKey: string, value: MetadataValue) => {
    try {
      await updateCard({ metadata: { [metadataKey]: value } });
    } catch (error) {
      notifyError(error);
    }
  };

  const saveContent = async () => {
    try {
      await updateCard({ content });
      dispatch(
        addNotification({ message: t('saveCard.success'), type: 'success' }),
      );
    } catch (error) {
      notifyError(error);
    }
  };

  const previewCard = useMemo<CardResponse>(
    () => ({
      ...card,
      title: (draft[TITLE_KEY] as string) ?? card.title,
      labels: (draft[LABELS_KEY] as string[]) ?? card.labels,
      rawContent: content,
      parsedContent: previewHtml ?? card.parsedContent,
      fields: (card.fields ?? []).map((f) => ({
        ...f,
        value: draft[f.key] as typeof f.value,
      })),
    }),
    [card, draft, content, previewHtml],
  );

  const parent = resourceTree
    ? findCardParentInResourceTree(resourceTree, node.id)
    : null;

  const togglePreview = () => setIsPreview((p) => !p);

  return (
    <Stack height="100%">
      <CardToolbar
        cardKey={node.id}
        linkButtonDisabled={true}
        afterDelete={() =>
          router.push(
            parent ? `/configuration/${parent.name}` : '/configuration',
          )
        }
        presenceMode={editable && !isPreview ? 'editing' : 'viewing'}
      />
      <Box flexGrow={1} minHeight={0} display="flex" flexDirection="column">
        {isPreview ? (
          <TemplateCardPreview
            card={previewCard}
            header={
              <PreviewToggle isPreview={isPreview} onToggle={togglePreview} />
            }
          />
        ) : (
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            flexGrow={1}
            minHeight={0}
            sx={{
              overflowY: { xs: 'auto', lg: 'hidden' },
              scrollbarWidth: 'thin',
            }}
          >
            <Box
              width="100%"
              flexGrow={1}
              padding={{ xs: 2, sm: 3 }}
              sx={{ overflowY: { lg: 'auto' }, scrollbarWidth: 'thin' }}
            >
              <Stack spacing={2}>
                <PreviewToggle isPreview={isPreview} onToggle={togglePreview} />
                <TitleEditor
                  value={(draft[TITLE_KEY] as string) ?? ''}
                  dirty={titleDirty}
                  editable={editable && !titleDenied}
                  onChange={(v) => setField(TITLE_KEY, v)}
                  onSave={() => saveMetadata('title', draft[TITLE_KEY])}
                  onCancel={() => setField(TITLE_KEY, savedDraft[TITLE_KEY])}
                />
                <MetadataFields
                  card={card}
                  draft={draft}
                  editable={editable}
                  onChange={setField}
                  onSave={saveMetadata}
                  onCancel={(key, savedValue) => setField(key, savedValue)}
                />
                {isNarrow && editable && (
                  <AttachmentPanel
                    cardKey={card.key}
                    attachments={card.attachments ?? []}
                    onInsert={(attachment) =>
                      contentRef.current?.insertAttachment(attachment)
                    }
                  />
                )}
                <ContentEditor
                  ref={contentRef}
                  value={content}
                  editable={editable}
                  dirty={contentDirty}
                  cardKey={card.key}
                  attachments={card.attachments ?? []}
                  onChange={setContent}
                  onSave={saveContent}
                  onCancel={() => setContent(card.rawContent ?? '')}
                />
              </Stack>
            </Box>
            {!isNarrow && editable && (
              <Stack
                data-cy="cardSidebar"
                sx={{
                  width: 250,
                  minWidth: 250,
                  flexShrink: 0,
                  my: 2,
                  mr: 3,
                  overflowY: 'auto',
                  scrollbarWidth: 'thin',
                }}
              >
                <AttachmentPanel
                  cardKey={card.key}
                  attachments={card.attachments ?? []}
                  onInsert={(attachment) =>
                    contentRef.current?.insertAttachment(attachment)
                  }
                />
              </Stack>
            )}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
