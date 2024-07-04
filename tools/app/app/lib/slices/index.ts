import { combineReducers } from '@reduxjs/toolkit';
import recentlyViewed from './recentlyViewed';
import notifications from './notifications';

const rootReducer = combineReducers({
  recentlyViewed,
  notifications,
});

export default rootReducer;
