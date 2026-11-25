// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { GenericNode } from '@/lib/api/types';
import type * as HooksModule from '@/lib/hooks';

const renamePrefix = vi.fn();
const push = vi.fn();
// The options each editable field was set up with, by action key.
const fields = new Map<
  string,
  { saveValue: (value: string) => Promise<void> }
>();

vi.mock('@/lib/api', () => ({
  useProjectSettings: () => ({ general: undefined, isLoading: false }),
  usePublicKey: () => ({ publicKey: undefined }),
  useProjectSettingsMutations: () => ({
    isUpdating: () => false,
    updateProject: vi.fn(),
    renamePrefix,
  }),
}));

vi.mock('@/lib/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof HooksModule>()),
  useAppRouter: () => ({ push }),
  useEditableField: (options: {
    actionKey: string;
    saveValue: (value: string) => Promise<void>;
  }) => {
    fields.set(options.actionKey, options);
    return {
      value: '',
      setValue: vi.fn(),
      dirty: false,
      save: vi.fn(),
      cancel: vi.fn(),
      saving: false,
      disabled: false,
    };
  },
}));

vi.mock('@/lib/auth', () => ({
  UserRole: { Admin: 'admin' },
  useHasMinRole: () => true,
}));

vi.mock('@/components/config-editors/BaseEditor', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/config-editors/HubsSection', () => ({
  default: () => null,
}));
vi.mock('@/components/config-editors/ModulesSection', () => ({
  default: () => null,
}));

const { GeneralEditor } =
  await import('@/components/config-editors/GeneralEditor');

const node = {
  name: 'general',
  type: 'general',
  data: { name: 'Project', cardKeyPrefix: 'old' },
} as unknown as GenericNode<'general'>;

beforeEach(() => {
  vi.clearAllMocks();
  fields.clear();
});

describe('GeneralEditor', () => {
  // The project is served under its new prefix only.
  it('goes to the renamed project once the prefix is renamed', async () => {
    renamePrefix.mockResolvedValue('new');
    render(<GeneralEditor node={node} />);

    await fields.get('update-cardKeyPrefix')!.saveValue('new');

    expect(renamePrefix).toHaveBeenCalledWith('new');
    expect(push).toHaveBeenCalledWith('/projects/new/configuration/general');
  });

  it('stays where it is when the rename fails', async () => {
    renamePrefix.mockRejectedValue(new Error('refused'));
    render(<GeneralEditor node={node} />);

    await expect(
      fields.get('update-cardKeyPrefix')!.saveValue('x'),
    ).rejects.toThrow('refused');

    expect(push).not.toHaveBeenCalled();
  });
});
