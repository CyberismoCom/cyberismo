// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

export type CardAction =
  | 'update'
  | 'delete'
  | 'create'
  | 'updateState'
  | 'createLink'
  | 'deleteLink'
  | 'editLink'
  | 'move';

export type AttachmentAction = 'add' | 'remove';

export type Action = CardAction | AttachmentAction;
