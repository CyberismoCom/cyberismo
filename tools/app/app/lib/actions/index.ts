import { createAction } from '@reduxjs/toolkit'
import { CardView, SuccessEvent, ErrorEvent } from '../definitions'

export const cardViewed = createAction<CardView>('event/cardViewed')

export const cardDeleted = createAction<string>('event/cardDeleted')

export const errorEvent = createAction<ErrorEvent>('event/error')

export const successEvent = createAction<SuccessEvent>('event/success')
