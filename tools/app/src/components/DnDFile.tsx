// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
