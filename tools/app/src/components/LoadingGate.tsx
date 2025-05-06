/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import React from 'react';
import { useTranslation } from 'react-i18next';

interface LoadingGateProps {
  values?: any[];
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
  if (isLoading || values?.some((value) => value === null)) {
    const { t } = useTranslation();
    return loadingIndicator ? loadingIndicator : <div>{t('loading')}</div>;
  }

  return <>{children}</>;
};

export default LoadingGate;
