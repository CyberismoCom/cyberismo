// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { createAction } from '@reduxjs/toolkit';
import type { CardView } from '../definitions';

export const cardViewed = createAction<CardView>('event/cardViewed');

export const cardDeleted = createAction<string>('event/cardDeleted');
