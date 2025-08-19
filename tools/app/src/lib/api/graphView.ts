import { callApi } from '../swr';
import { apiPaths } from '../swr';
import { mutate } from 'swr';
import { CreateGraphViewData } from '@/lib/definitions';

export const createGraphView = async (data: CreateGraphViewData) => {
  await callApi(apiPaths.graphViews(), 'POST', data);
  mutate(apiPaths.graphViews());
  mutate(apiPaths.resourceTree());
};
