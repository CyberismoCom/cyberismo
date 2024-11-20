/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { CommandManager } from '@cyberismocom/data-handler/command-manager';

import Processor from '@asciidoctor/core';

import { NextRequest, NextResponse } from 'next/server';
import {
  FetchCardDetails,
  MetadataContent,
} from '@cyberismocom/data-handler/interfaces/project-interfaces';
import { evaluateMacros } from '@cyberismocom/data-handler/macros';

export const dynamic = 'force-dynamic';

/**
 * @swagger
 * /api/cards/{key}:
 *   get:
 *     summary: Returns the full content of a specific card.
 *     description: The key parameter is the unique identifier ("cardKey") of the card. The response includes the metadata and the content of the card.
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *       - name: contentType
 *         in: query
 *         required: false
 *         description: Content type of the card. Must be adoc or html. Defaults to adoc if not included.
 *     responses:
 *       200:
 *         description: Object containing card details. See definitions.ts/CardDetails for the structure.
 *       400:
 *        description: No search key or card not found with given key, or invalid contentType.
 *       500:
 *         description: project_path not set.
 *   put:
 *     summary: Make changes to a card
 *     description: The key parameter is the unique identifier ("cardKey") of the card.
 *     parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *       - name: contentType
 *         in: query
 *         required: false
 *         description: Content type of the card. Must be adoc or html. Defaults to adoc if not included.
 *       - name: content
 *         in: body
 *         required: false
 *         description: New asciidoc content for the card. Must be a string.
 *       - name: metadata
 *         in: body
 *         type: object
 *         required: false
 *         description: New metadata for the card. Must be an object with key-value pairs.
 *     responses:
 *       200:
 *         description: Object containing card details, same as GET. See definitions.ts/CardDetails for the structure.
 *       207:
 *         description: Partial success. some updates failed, some succeeded. Returns card object with successful updates.
 *       400:
 *         description: Error. Card not found, all updates failed etc. Error message in response body.
 *       500:
 *         description: project_path not set.
 *   delete:
 *      summary: Delete a card
 *      description: The key parameter is the unique identifier ("cardKey") of the card.
 *      parameters:
 *       - name: key
 *         in: path
 *         required: true
 *         description: Card key (string)
 *
 *     responses:
 *       204:
 *         description: Card deleted successfully.
 *       400:
 *         description: Error. Card not found. Error message in response body.
 *       500:
 *         description: project_path not set.
 */
export async function GET(request: NextRequest) {
  const projectPath = process.env.npm_config_project_path;
  if (!projectPath) {
    return new NextResponse('project_path not set', { status: 500 });
  }

  // Last URL segment is the search parameter
  const key = request.nextUrl.pathname.split('/')?.pop();
  if (key == null) {
    return new NextResponse('No search key', { status: 400 });
  }

  // contentType defaults to adoc if not set
  const contentType = request.nextUrl.searchParams.get('contentType') ?? 'adoc';

  return await getCardDetails(projectPath, key, contentType);
}

export async function PATCH(request: NextRequest) {
  const projectPath = process.env.npm_config_project_path;
  if (!projectPath) {
    return new NextResponse('project_path not set', { status: 500 });
  }
  const commands = await CommandManager.getInstance(projectPath);

  // Last URL segment is the search parameter
  const key = request.nextUrl.pathname.split('/')?.pop();
  if (key == null) {
    return new NextResponse('No search key', { status: 400 });
  }

  const res = await request.json();

  let successes = 0;
  const errors = [];

  if (res.state) {
    try {
      await commands.transitionCmd.cardTransition(key, res.state);
      successes++;
    } catch (error) {
      if (error instanceof Error) errors.push(error.message);
    }
  }

  if (res.content != null) {
    try {
      await commands.editCmd.editCardContent(key, res.content);
      successes++;
    } catch (error) {
      if (error instanceof Error) errors.push(error.message);
    }
  }

  if (res.metadata) {
    for (const [metadataKey, metadataValue] of Object.entries(res.metadata)) {
      const value = metadataValue as MetadataContent;

      try {
        await commands.editCmd.editCardMetadata(key, metadataKey, value);
        successes++;
      } catch (error) {
        if (error instanceof Error) errors.push(error.message);
      }
    }
  }

  if (res.parent) {
    try {
      await commands.moveCmd.moveCard(key, res.parent);
      successes++;
    } catch (error) {
      if (error instanceof Error) errors.push(error.message);
    }
  }
  if (res.index != null) {
    try {
      await commands.moveCmd.rankByIndex(key, res.index);
      successes++;
    } catch (error) {
      if (error instanceof Error) errors.push(error.message);
    }
  }

  // TODO add other update options here

  // contentType defaults to adoc if not set
  const contentType = request.nextUrl.searchParams.get('contentType') ?? 'adoc';
  if (errors.length > 0) {
    // All updates failed
    return new NextResponse(errors.join('\n'), { status: 400 });
  }

  const details = await getCardDetails(projectPath, key, contentType);

  return details;
}

async function getCardDetails(
  projectPath: string,
  key: string,
  contentType: string,
): Promise<NextResponse> {
  if (contentType !== 'adoc' && contentType !== 'html') {
    return new NextResponse('contentType must be adoc or html', {
      status: 400,
    });
  }

  const fetchCardDetails: FetchCardDetails = {
    attachments: true,
    children: false,
    content: true,
    contentType,
    metadata: false,
    parent: false,
  };

  const commands = await CommandManager.getInstance(projectPath);
  try {
    const cardDetailsResponse = await commands.showCmd.showCardDetails(
      fetchCardDetails,
      key,
    );
    let asciidocContent = '';
    try {
      asciidocContent = await evaluateMacros(
        cardDetailsResponse.content || '',
        {
          mode: 'inject',
          projectPath,
          cardKey: key,
        },
      );
    } catch (error) {
      asciidocContent = `Macro error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n${asciidocContent}`;
    }

    const htmlContent = Processor()
      .convert(asciidocContent, {
        safe: 'safe',
        attributes: {
          imagesdir: `/api/cards/${key}/a`,
          icons: 'font',
        },
      })
      .toString();

    // always parse for now
    await commands.calculateCmd.generate();

    const card = await commands.calculateCmd.runQuery('card', {
      cardKey: key,
    });

    if (card.length !== 1) {
      return new NextResponse(`Query failed. Check card-query syntax`, {
        status: 500,
      });
    }

    if (cardDetailsResponse) {
      return NextResponse.json({
        ...card[0],
        content: cardDetailsResponse.content || '',
        parsed: htmlContent,
        attachments: cardDetailsResponse.attachments,
      });
    } else {
      return new NextResponse(`Card ${key} not found from project`, {
        status: 400,
      });
    }
  } catch (error) {
    return new NextResponse(`Card ${key} not found from project`, {
      status: 400,
    });
  }
}

export async function DELETE(request: NextRequest) {
  const projectPath = process.env.npm_config_project_path;
  if (!projectPath) {
    return new NextResponse('project_path not set', { status: 500 });
  }
  const commands = await CommandManager.getInstance(projectPath);

  const key = request.nextUrl.pathname.split('/')?.pop();

  if (key == null) {
    return new NextResponse('No search key', { status: 400 });
  }

  try {
    await commands.removeCmd.remove('card', key);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 400 });
    }
  }
}

export async function POST(request: NextRequest) {
  const projectPath = process.env.npm_config_project_path;
  if (!projectPath) {
    return new NextResponse('project_path not set', { status: 500 });
  }

  const key = request.nextUrl.pathname.split('/')?.pop();

  if (key == null) {
    return new NextResponse('No search key', { status: 400 });
  }

  const res = await request.json();

  if (res.template == null) {
    return new NextResponse('template is required', {
      status: 400,
    });
  }

  const commands = await CommandManager.getInstance(projectPath);

  try {
    return NextResponse.json(
      await commands.createCmd.createCard(
        res.template,
        key === 'root' ? undefined : key,
      ),
    );
  } catch (error) {
    if (error instanceof Error) {
      return new NextResponse(error.message, { status: 400 });
    }
  }
}
