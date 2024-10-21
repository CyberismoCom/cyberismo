/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Calculate } from '@cyberismocom/data-handler/calculate';
import { Create } from '@cyberismocom/data-handler/create';
import { Edit } from '@cyberismocom/data-handler/edit';
import { Move } from '@cyberismocom/data-handler/move';
import { Remove } from '@cyberismocom/data-handler/remove';
import { Show } from '@cyberismocom/data-handler/show';
import { Transition } from '@cyberismocom/data-handler/transition';

import Processor from 'asciidoctor';

import { NextRequest, NextResponse } from 'next/server';
import {
  FetchCardDetails,
  MetadataContent,
} from '@cyberismocom/data-handler/interfaces/project-interfaces';
import { evaluateMacros } from '@cyberismocom/data-handler/macros';
import { executeCardQuery } from '../../../lib/server/query';

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

  // Last URL segment is the search parameter
  const key = request.nextUrl.pathname.split('/')?.pop();
  if (key == null) {
    return new NextResponse('No search key', { status: 400 });
  }

  const cardQueryResult = await executeCardQuery(projectPath, key);

  const res = await request.json();

  let successes = 0;
  const errors = [];

  if (
    res.content != null &&
    cardQueryResult.deniedOperations.editContent.length > 0
  ) {
    return new NextResponse(
      cardQueryResult.deniedOperations.editContent
        .map((v) => v.errorMessage)
        .join(' '),
      {
        status: 403,
      },
    );
  }

  if (res.state) {
    const calculateCommand = new Calculate();
    const transitionCommand = new Transition(calculateCommand);
    try {
      await transitionCommand.cardTransition(projectPath, key, res.state);
      successes++;
    } catch (error) {
      if (error instanceof Error) errors.push(error.message);
    }
  }

  if (res.content != null) {
    const editCommand = new Edit();
    try {
      await editCommand.editCardContent(projectPath, key, res.content);
      successes++;
    } catch (error) {
      if (error instanceof Error) errors.push(error.message);
    }
  }

  if (res.metadata) {
    const editCommand = new Edit();

    for (const [metadataKey, metadataValue] of Object.entries(res.metadata)) {
      const value = metadataValue as MetadataContent;

      try {
        await editCommand.editCardMetadata(
          projectPath,
          key,
          metadataKey,
          value,
        );
        successes++;
      } catch (error) {
        if (error instanceof Error) errors.push(error.message);
      }
    }
  }

  if (res.parent) {
    const moveCommand = new Move();
    try {
      await moveCommand.moveCard(projectPath, key, res.parent);
      successes++;
    } catch (error) {
      if (error instanceof Error) errors.push(error.message);
    }
  }
  if (res.index != null) {
    const moveCommand = new Move();
    try {
      await moveCommand.rankByIndex(projectPath, key, res.index);
      successes++;
    } catch (error) {
      if (error instanceof Error) errors.push(error.message);
    }
  }

  // TODO add other update options here

  // contentType defaults to adoc if not set
  const contentType = request.nextUrl.searchParams.get('contentType') ?? 'adoc';
  if (errors.length > 0 && successes == 0) {
    // All updates failed
    return new NextResponse(errors.join('\n'), { status: 400 });
  }

  const details = await getCardDetails(projectPath, key, contentType);

  if (errors.length > 0) {
    // Some of the updates failed
    if (details.status == 200) {
      return new NextResponse(details.body, {
        status: 207,
        statusText: errors.join('\n'),
      });
    } else {
      return details;
    }
  }

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
    contentType: contentType,
    metadata: true,
    parent: false,
  };

  const showCommand = new Show();
  try {
    const cardDetailsResponse = await showCommand.showCardDetails(
      projectPath,
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

    if (cardDetailsResponse) {
      return NextResponse.json({
        ...cardDetailsResponse,
        content: cardDetailsResponse.content || '',
        parsed: htmlContent,
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

  const key = request.nextUrl.pathname.split('/')?.pop();

  if (key == null) {
    return new NextResponse('No search key', { status: 400 });
  }

  const cardQueryResult = await executeCardQuery(projectPath, key);

  if (cardQueryResult.deniedOperations.delete.length > 0) {
    return new NextResponse(
      cardQueryResult.deniedOperations.delete
        .map((v) => v.errorMessage)
        .join(' '),
      {
        status: 403,
      },
    );
  }

  const removeCommand = new Remove(new Calculate());

  try {
    await removeCommand.remove(projectPath, 'card', key);
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

  const createCommand = new Create(new Calculate());

  try {
    return NextResponse.json(
      await createCommand.createCard(
        projectPath,
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
