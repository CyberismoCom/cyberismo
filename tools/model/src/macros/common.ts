// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// important that this file imports only the metadata
import createCards from './createCards/metadata.js';
import graph from './graph/metadata.js';
import image from './image/metadata.js';
import include from './include/metadata.js';
import report from './report/metadata.js';
import scoreCard from './scoreCard/metadata.js';
import xref from './xref/metadata.js';
import percentage from './percentage/metadata.js';
import mermaid from './mermaid/metadata.js';
import vega from './vega/metadata.js';
import vegaLite from './vegalite/metadata.js';

export const macroMetadata = {
  createCards,
  graph,
  image,
  include,
  mermaid,
  report,
  scoreCard,
  xref,
  percentage,
  vega,
  vegaLite,
};
