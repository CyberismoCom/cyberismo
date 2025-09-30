/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import type { DragEventHandler, ReactNode } from 'react';
import { useState } from 'react';

function DnDFile({
  children,
  onDrop,
}: {
  children: ({ isHovering }: { isHovering: boolean }) => ReactNode;
  onDrop?: (files: FileList) => void;
}) {
  const [isHovering, setIsHovering] = useState<boolean>(false);

  const handleDragLeave: DragEventHandler = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (
      x <= rect.left ||
      x >= rect.right ||
      y <= rect.top ||
      y >= rect.bottom
    ) {
      setIsHovering(false);
    }
  };

  const handleDragEnter: DragEventHandler = () => {
    setIsHovering(true);
  };

  const handleDrop: DragEventHandler = (e) => {
    e.preventDefault();
    setIsHovering(false);
    if (onDrop && e.dataTransfer.files.length > 0) onDrop(e.dataTransfer.files);
  };

  return (
    <div
      onDragLeave={handleDragLeave}
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {children({
        isHovering,
      })}
    </div>
  );
}

export default DnDFile;
