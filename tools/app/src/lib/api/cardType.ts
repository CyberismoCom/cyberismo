import { callApi } from '../swr';
import { apiPaths } from '../swr';
import { mutate } from 'swr';
import { CreateCardTypeData } from '@/lib/definitions';

export const createCardType = async (data: CreateCardTypeData) => {
  await callApi(apiPaths.cardTypes(), 'POST', data);
  mutate(apiPaths.cardTypes());
  mutate(apiPaths.resourceTree());
};
