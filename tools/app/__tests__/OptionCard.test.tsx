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

import { describe, it, expect, vi } from 'vite-plus/test';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Radio, Typography } from '@mui/joy';
import { OptionCard } from '@/components/OptionCard';

describe('OptionCard', () => {
  it('shows a title, a caption and a corner action', () => {
    render(
      <OptionCard
        title="Base module"
        caption="Card key prefix: base"
        action={<Radio checked={false} />}
      />,
    );

    expect(screen.getByText('Base module')).toBeInTheDocument();
    expect(screen.getByText('Card key prefix: base')).toBeInTheDocument();
    expect(screen.getByRole('radio')).toBeInTheDocument();
  });

  it('renders further band content under the caption', () => {
    render(
      <OptionCard title="A project" caption="proj">
        <Typography>A description of it</Typography>
      </OptionCard>,
    );

    expect(screen.getByText('proj')).toBeInTheDocument();
    expect(screen.getByText('A description of it')).toBeInTheDocument();
  });

  it('does not select while disabled', () => {
    const onClick = vi.fn();
    render(
      <OptionCard title="Unavailable" caption="x" disabled onClick={onClick} />,
    );

    fireEvent.click(screen.getByText('Unavailable'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('selects on click when enabled', () => {
    const onClick = vi.fn();
    render(<OptionCard title="Pick me" caption="x" onClick={onClick} />);

    fireEvent.click(screen.getByText('Pick me'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('selects on Enter', () => {
    const onClick = vi.fn();
    render(<OptionCard title="Pick me" caption="x" onClick={onClick} />);

    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('selects on Space without scrolling the page', () => {
    const onClick = vi.fn();
    render(<OptionCard title="Pick me" caption="x" onClick={onClick} />);

    const card = screen.getByRole('button');
    const defaultPrevented = !fireEvent.keyDown(card, { key: ' ' });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(defaultPrevented).toBe(true);
  });

  it('ignores other keys', () => {
    const onClick = vi.fn();
    render(<OptionCard title="Pick me" caption="x" onClick={onClick} />);

    fireEvent.keyDown(screen.getByRole('button'), { key: 'a' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is a tab stop when clickable', () => {
    render(<OptionCard title="Pick me" caption="x" onClick={vi.fn()} />);

    expect(screen.getByRole('button')).toHaveAttribute('tabindex', '0');
  });

  it('is neither focusable nor selectable by keyboard while disabled', () => {
    const onClick = vi.fn();
    render(
      <OptionCard title="Unavailable" caption="x" disabled onClick={onClick} />,
    );

    const card = screen.getByRole('button');
    expect(card).toHaveAttribute('tabindex', '-1');
    expect(card).toHaveAttribute('aria-disabled', 'true');

    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: ' ' });
    expect(onClick).not.toHaveBeenCalled();
  });

  // HubsSection puts a real button in the action slot, so the card itself must
  // stay out of the tab order and leave that button as the only interactive
  // element.
  it('is not a button without onClick', () => {
    const { container } = render(
      <OptionCard title="Just a tile" caption="x" />,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(container.firstElementChild).not.toHaveAttribute('tabindex');
  });

  // The caller decides its own hooks; the card imposes none.
  it('carries no class of its own unless given one', () => {
    const { container, rerender } = render(<OptionCard title="No class" />);
    expect(container.querySelector('.templateCard')).toBeNull();

    rerender(<OptionCard title="No class" className="templateCard" />);
    expect(container.querySelector('.templateCard')).not.toBeNull();
  });
});
