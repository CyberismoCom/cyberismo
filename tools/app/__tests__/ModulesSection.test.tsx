/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { UpdatePlan } from '@cyberismo/data-handler';
import type { ProjectModule } from '@/lib/api/types';

const fetchModuleUpdatePlan = vi.fn();
let modules: ProjectModule[];

vi.mock('@/lib/api', () => ({
  fetchModuleUpdatePlan: () => fetchModuleUpdatePlan(),
  useProjectSettings: () => ({ general: { modules } }),
  useProjectSettingsMutations: () => ({
    updateModule: vi.fn(),
    deleteModule: vi.fn(),
    updateAllModules: vi.fn(),
    addModule: vi.fn(),
    isUpdating: () => false,
  }),
}));
vi.mock('@/lib/hooks', () => ({ useAppDispatch: () => vi.fn() }));
vi.mock('@/components/modals', () => ({
  ModuleDeleteModal: () => null,
  AddModuleModal: () => null,
}));
vi.mock('@/components/config-editors/useCleanPrompt', () => ({
  useCleanPrompt: () => ({ maybePromptClean: vi.fn() }),
}));

const { ModulesSection } =
  await import('@/components/config-editors/ModulesSection');

const base = (installedVersion: string): ProjectModule => ({
  name: 'Base',
  cardKeyPrefix: 'base',
  isRoot: true,
  parents: [],
  installedVersion,
});
const upToDatePlan: UpdatePlan = {
  ok: true,
  changes: [],
  removed: [],
  conflicts: [],
  rangeWrites: [],
  roots: [
    {
      module: 'base',
      installed: '1.0.0',
      range: '^1.0.0',
      latest: '1.0.0',
      heldBack: false,
      versionSource: 'git',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  modules = [base('1.0.0')];
  fetchModuleUpdatePlan.mockResolvedValue(upToDatePlan);
});

describe('ModulesSection', () => {
  it('offers a reader no check and asks the sources nothing', () => {
    render(<ModulesSection disabled={true} />);

    expect(
      screen.queryByRole('button', { name: 'Check for updates' }),
    ).not.toBeInTheDocument();
    expect(fetchModuleUpdatePlan).not.toHaveBeenCalled();
  });

  it.each([
    ['version', { installedVersion: '1.1.0' }],
    ['declared range', { declaredRange: '^1.1.0' }],
  ])(
    'drops a check result once a module %s changes',
    async (_, change: Partial<ProjectModule>) => {
      const { rerender } = render(<ModulesSection disabled={false} />);

      fireEvent.click(
        screen.getByRole('button', { name: 'Check for updates' }),
      );
      expect(await screen.findByText('Up to date')).toBeInTheDocument();

      modules = [{ ...base('1.0.0'), ...change }];
      rerender(<ModulesSection disabled={false} />);

      expect(screen.queryByText('Up to date')).not.toBeInTheDocument();
    },
  );

  it('holds module changes while a check runs', () => {
    fetchModuleUpdatePlan.mockReturnValue(new Promise(() => {}));
    render(<ModulesSection disabled={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));

    expect(screen.getByRole('button', { name: 'Update Base' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Install module' }),
    ).toBeDisabled();
  });
});
