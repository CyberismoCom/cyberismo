import { createAction } from '@reduxjs/toolkit';
import { CardView } from '../definitions';

export const cardViewed = createAction<CardView>('event/cardViewed');

export const cardDeleted = createAction<string>('event/cardDeleted');
