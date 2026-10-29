// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import React from 'react';
import { useTranslation } from 'react-i18next';

interface LoadingGateProps {
  values?: unknown[];
  isLoading?: boolean;
  loadingIndicator?: React.ReactNode;
  children: React.ReactNode;
}

const LoadingGate: React.FC<LoadingGateProps> = ({
  isLoading,
  values,
  loadingIndicator,
  children,
}) => {
  const { t } = useTranslation();

  if (isLoading || values?.some((value) => value === null)) {
    return loadingIndicator ? loadingIndicator : <div>{t('loading')}</div>;
  }

  return <>{children}</>;
};

export default LoadingGate;
