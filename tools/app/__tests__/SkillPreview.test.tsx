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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type * as Utils from '@/lib/utils';
import type * as HooksUtils from '@/lib/hooks/utils';

vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value }: { value: string }) => (
    <div data-testid="codemirror">{value}</div>
  ),
}));
vi.mock('@/components/toolbar/ConfigToolbar', () => ({ default: () => null }));

const previewSkill = vi.fn();
vi.mock('@/lib/api', () => ({
  previewSkill: (...args: unknown[]) => previewSkill(...args),
  useResource: () => ({ update: vi.fn(), isUpdating: () => false }),
}));

vi.mock('@/lib/hooks', async () => {
  const utils = await vi.importActual<typeof HooksUtils>('@/lib/hooks/utils');
  return {
    useAppDispatch: () => vi.fn(),
    useIsDarkMode: () => false,
    formKeyHandler: utils.formKeyHandler,
  };
});

let isAdmin = true;
vi.mock('@/lib/auth', () => ({
  UserRole: { Reader: 0, Editor: 1, Admin: 2 },
  useHasMinRole: () => isAdmin,
}));

vi.mock('@/lib/utils', async (orig) => ({
  ...(await orig<typeof Utils>()),
  getConfig: () => ({ staticMode: false }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));

import { TextEditor } from '@/components/config-editors/TextEditor';
import SkillPreview from '@/components/config-editors/SkillPreview';

const skillFileNode = {
  id: 'skills-project/skills/risk-skillContent',
  type: 'file' as const,
  name: 'project/skills/risk/skillContent',
  displayName: 'skillContent',
  resourceName: 'project/skills/risk',
  fileName: 'skillContent',
  data: { content: '# {{cardKey}}\n' },
};

const queryFileNode = {
  ...skillFileNode,
  id: 'skills-project/skills/risk-skillQuery',
  name: 'project/skills/risk/skillQuery',
  displayName: 'skillQuery',
  fileName: 'skillQuery',
  data: { content: 'result(x).' },
};

describe('SkillPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewSkill.mockResolvedValue('## Heading\n\n- one\n- two\n');
  });

  it('renders the returned markdown as HTML', async () => {
    render(
      <SkillPreview resourceName="project/skills/risk" content="# draft" />,
    );

    const heading = await screen.findByRole('heading', { name: 'Heading' });
    expect(heading.tagName).toBe('H2');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('sends the unsaved content to the server', async () => {
    render(
      <SkillPreview resourceName="project/skills/risk" content="# draft" />,
    );

    await waitFor(() => expect(previewSkill).toHaveBeenCalled());
    expect(previewSkill).toHaveBeenCalledWith('project/skills/risk', {
      skillContent: '# draft',
      cardKey: undefined,
    });
  });

  it('re-renders with a card key once it is committed', async () => {
    render(
      <SkillPreview resourceName="project/skills/risk" content="# draft" />,
    );
    await waitFor(() => expect(previewSkill).toHaveBeenCalledTimes(1));

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'proj_1' } });
    // Typing alone must not trigger a request per keystroke.
    expect(previewSkill).toHaveBeenCalledTimes(1);

    fireEvent.blur(input);
    await waitFor(() => expect(previewSkill).toHaveBeenCalledTimes(2));
    expect(previewSkill).toHaveBeenLastCalledWith('project/skills/risk', {
      skillContent: '# draft',
      cardKey: 'proj_1',
    });
  });

  it('shows the server error message when rendering fails', async () => {
    previewSkill.mockRejectedValue(new Error('clingo: syntax error'));
    render(
      <SkillPreview resourceName="project/skills/risk" content="# draft" />,
    );

    expect(await screen.findByText('clingo: syntax error')).toBeInTheDocument();
  });

  it('reports empty output instead of rendering nothing', async () => {
    previewSkill.mockResolvedValue('   \n');
    render(
      <SkillPreview resourceName="project/skills/risk" content="# draft" />,
    );

    expect(await screen.findByText('skillPreview.empty')).toBeInTheDocument();
  });
});

describe('TextEditor preview toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdmin = true;
    previewSkill.mockResolvedValue('## Rendered\n');
  });

  it('offers a preview for skill.md and renders the unsaved buffer', async () => {
    render(<TextEditor node={skillFileNode} />);

    // Starts in edit mode.
    expect(screen.getByTestId('codemirror')).toBeInTheDocument();
    expect(previewSkill).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'preview' }));

    expect(
      await screen.findByRole('heading', { name: 'Rendered' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('codemirror')).not.toBeInTheDocument();
    expect(previewSkill).toHaveBeenCalledWith('project/skills/risk', {
      skillContent: '# {{cardKey}}\n',
      cardKey: undefined,
    });

    // Toggling back returns to the editor.
    fireEvent.click(screen.getByRole('button', { name: 'edit' }));
    expect(screen.getByTestId('codemirror')).toBeInTheDocument();
  });

  it('does not offer a preview for other resource files', () => {
    render(<TextEditor node={queryFileNode} />);

    expect(screen.getByTestId('codemirror')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'preview' }),
    ).not.toBeInTheDocument();
  });

  it('does not offer a preview to a non-admin, whose request would be denied', () => {
    isAdmin = false;
    render(<TextEditor node={skillFileNode} />);

    expect(
      screen.queryByRole('button', { name: 'preview' }),
    ).not.toBeInTheDocument();
  });

  it('stays in preview when the resource tree refetches', async () => {
    const { rerender } = render(<TextEditor node={skillFileNode} />);
    fireEvent.click(screen.getByRole('button', { name: 'preview' }));
    await screen.findByRole('heading', { name: 'Rendered' });

    // Saving mutates the tree, so the page hands down an equal-but-new node.
    rerender(<TextEditor node={{ ...skillFileNode }} />);

    expect(
      screen.getByRole('heading', { name: 'Rendered' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('codemirror')).not.toBeInTheDocument();
  });
});
