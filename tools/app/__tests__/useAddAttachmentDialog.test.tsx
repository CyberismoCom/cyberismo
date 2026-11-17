// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const uploads: [string, string[]][] = [];
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));
vi.mock('@/lib/api/attachments', () => ({
  useAttachments: (key: string) => ({
    addAttachments: async (files: File[]) => {
      uploads.push([key, files.map((f) => f.name)]);
    },
    removeAttachment: vi.fn(),
    isUpdating: () => false,
  }),
}));
vi.mock('@/lib/hooks', () => ({ useAppDispatch: () => () => {} }));
vi.mock('@/lib/auth', () => ({
  UserRole: { Reader: 0, Editor: 1, Admin: 2 },
  useHasMinRole: () => true,
}));

import { useAddAttachmentDialog } from '@/components/card/useAddAttachmentDialog';

// Held the way the card page holds it: one dialog for the page's life.
function Page({ cardKey }: { cardKey: string }) {
  const addAttachment = useAddAttachmentDialog(cardKey);
  return (
    <>
      <button onClick={addAttachment.open}>open-add</button>
      {addAttachment.dialog}
    </>
  );
}

describe('useAddAttachmentDialog', () => {
  it('does not carry files picked for one card to the next', async () => {
    const { rerender } = render(<Page cardKey="A" />);
    fireEvent.click(screen.getByText('open-add'));
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'picked-for-A.png')] },
    });
    expect(screen.getByText('picked-for-A.png')).toBeInTheDocument();

    // Browser back to another card while the dialog is open.
    rerender(<Page cardKey="B" />);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByText('open-add'));
    expect(screen.queryByText('picked-for-A.png')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByText('add'));
    });
    expect(uploads).toEqual([]);
  });
});
