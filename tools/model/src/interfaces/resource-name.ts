// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// Resource name parts are:
// - prefix; name of the project this resource is part of
// - type; type of resource; in plural
// - identifier; unique name (within a project/module) for the resource
export interface ResourceName {
  prefix: string;
  type: string; // todo: should be a ResourceFolderType
  identifier: string;
}
