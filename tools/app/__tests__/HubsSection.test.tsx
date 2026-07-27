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
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Hub } from '@/lib/api/types';

// Hubs are refreshed as a set — the data handler cannot fetch one hub on its
// own — so the section offers a single Update, not one per hub.

const addHub = vi.fn().mockResolvedValue(undefined);
const removeHub = vi.fn().mockResolvedValue(undefined);
const fetchHubs = vi.fn().mockResolvedValue(undefined);
const addModule = vi.fn().mockResolvedValue(undefined);
let hubs: Hub[] | undefined;

vi.mock('@/lib/api', () => ({
  useHubs: () => ({ data: hubs, isLoading: false }),
  useProjectSettingsMutations: () => ({
    addHub,
    removeHub,
    fetchHubs,
    addModule,
    isUpdating: () => false,
  }),
}));

vi.mock('@/lib/hooks', () => ({
  useAppDispatch: () => vi.fn(),
}));

const { HubsSection } = await import('@/components/config-editors/HubsSection');

const hub = (location: string, modules: Hub['modules']): Hub => ({
  location,
  displayName: `Hub at ${location}`,
  modules,
});

beforeEach(() => {
  vi.clearAllMocks();
  hubs = [
    hub('https://hub.test/one/', [
      {
        name: 'base',
        displayName: 'Base module',
        location: 'https://github.com/test/base.git',
        imported: false,
      },
      {
        name: 'ismsa',
        displayName: 'ISMS Essentials',
        location: 'https://github.com/test/isms.git',
        imported: true,
      },
    ]),
    hub('https://hub.test/two/', []),
  ];
});

describe('HubsSection', () => {
  it('renders every hub with its modules and card key prefixes', () => {
    render(<HubsSection disabled={false} />);

    expect(
      screen.getByText('Hub at https://hub.test/one/'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Hub at https://hub.test/two/'),
    ).toBeInTheDocument();
    expect(screen.getByText('Base module')).toBeInTheDocument();
    expect(screen.getByText('Card key prefix: base')).toBeInTheDocument();
    expect(
      screen.getByText('No modules available from this hub.'),
    ).toBeInTheDocument();
  });

  it('ranks the section above the hubs it contains', () => {
    render(<HubsSection disabled={false} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Hubs' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Hub at https://hub.test/one/',
      }),
    ).toBeInTheDocument();
    // The group label is a label, not a peer of the hub's own name.
    expect(
      screen.queryByRole('heading', { name: 'Modules' }),
    ).not.toBeInTheDocument();
  });

  it('offers one refresh for all hubs rather than one per hub', async () => {
    render(<HubsSection disabled={false} />);

    const update = screen.getAllByRole('button', { name: 'Update hubs' });
    expect(update).toHaveLength(1);

    fireEvent.click(update[0]);
    await waitFor(() => expect(fetchHubs).toHaveBeenCalledTimes(1));
  });

  it('imports a module by its location and offers no import for imported ones', async () => {
    render(<HubsSection disabled={false} />);

    const importButtons = screen.getAllByRole('button', { name: 'Add module' });
    // Only the module that is not yet imported can be imported.
    expect(importButtons).toHaveLength(1);

    fireEvent.click(importButtons[0]);
    await waitFor(() =>
      expect(addModule).toHaveBeenCalledWith(
        'https://github.com/test/base.git',
      ),
    );
  });

  it('adds a hub only once a location has been entered', async () => {
    render(<HubsSection disabled={false} />);

    const addButton = screen.getByRole('button', { name: 'Add hub' });
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Hub location url'), {
      target: { value: 'https://hub.test/three/' },
    });
    expect(addButton).toBeEnabled();

    fireEvent.click(addButton);
    await waitFor(() =>
      expect(addHub).toHaveBeenCalledWith('https://hub.test/three/'),
    );
  });

  it('asks for confirmation before removing a hub', () => {
    render(<HubsSection disabled={false} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(/Hub at https:\/\/hub.test\/one\//),
    ).toBeInTheDocument();
    expect(removeHub).not.toHaveBeenCalled();
  });

  it('disables every action for a reader', () => {
    render(<HubsSection disabled={true} />);

    expect(screen.getByRole('button', { name: 'Update hubs' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add module' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Delete' })[0]).toBeDisabled();
  });

  it('reports an empty hub list', () => {
    hubs = [];
    render(<HubsSection disabled={false} />);

    expect(
      screen.getByText('Project does not contain any hubs.'),
    ).toBeInTheDocument();
  });
});
