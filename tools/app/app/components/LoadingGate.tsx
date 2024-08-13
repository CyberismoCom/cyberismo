import React from 'react';

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
    return loadingIndicator ? loadingIndicator : <div>Loading...</div>;
  }

  return <>{children}</>;
};

export default LoadingGate;
