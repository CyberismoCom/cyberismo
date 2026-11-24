// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Button } from '@mui/joy';
import { useTranslation } from 'react-i18next';

/** A plain "Clear" button for a field value or a field override. */
export default function ClearButton({
  onClick,
  disabled,
  ariaLabel,
  dataCy,
}: {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  dataCy?: string;
}) {
  const { t } = useTranslation();
  return (
    <Button
      data-cy={dataCy}
      size="sm"
      variant="plain"
      color="neutral"
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={onClick}
      onMouseDown={(event) => {
        // Keep the focus in the editor: Safari does not focus a clicked
        // button, so a blur here would save the draft before the clear.
        event.preventDefault();
        // Keep a Select listbox from opening.
        event.stopPropagation();
      }}
    >
      {t('clear')}
    </Button>
  );
}
