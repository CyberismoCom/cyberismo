// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { combineReducers } from '@reduxjs/toolkit';
import recentlyViewed from './recentlyViewed';
import notifications from './notifications';
import swr from './swr';
import page from './pageState';
import card from './card';
import session from './session';
import project from './project';
import cleanPrompt from './cleanPrompt';

const rootReducer = combineReducers({
  recentlyViewed,
  notifications,
  swr,
  page,
  card,
  session,
  project,
  cleanPrompt,
});

export default rootReducer;
