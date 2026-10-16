// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// Base props that all input components should accept for keyboard and focus handling
export interface BaseInputProps {
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
  disabled?: boolean;
}

// Common option item interface for select components
export interface OptionItem {
  id: string;
  displayName: string;
}
