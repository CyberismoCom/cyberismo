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

import type {
  ActorRef,
  AttachmentContent,
  Card,
  CardAttachment,
  CardListContainer,
  CardLocation,
  MetadataContent,
  TemplateCardTree,
} from '@cyberismo/model';
import type { Checkout } from '../../state/checkout/checkout.js';
import { read, write } from '../../infra/tx/rw-lock.js';
import type { CommitIdentity } from '../../infra/tx/tx-record.js';
import {
  addAttachment,
  removeAttachment,
  renameCardAttachment,
} from './attachments.js';
import { removeCard } from './delete.js';
import { importCsv } from './import-csv.js';
import { addCards, createCard } from './instantiate.js';
import {
  moveCard,
  rankAfter,
  rankAt,
  rankFirst,
  rebalanceAll,
  rebalanceUnder,
} from './move.js';
import {
  attachment,
  attachments,
  findCard,
  hasCard,
  labels,
  listCards,
  rootCards,
  templateCardTrees,
} from './read.js';
import { transitionCard } from './transition.js';
import {
  addLabel,
  addLink,
  editCardContent,
  editCardMetadata,
  removeLabel,
  removeLink,
} from './update.js';

/**
 * Card operations of one handle. Writes through it are the handle's actor's.
 * Holds no state of its own.
 */
export class Cards {
  /** @internal */
  constructor(
    private readonly checkout: Checkout,
    public readonly actor: ActorRef,
    public readonly identity: CommitIdentity | undefined,
  ) {}

  /**
   * Moves a card under another card, or to a root.
   * @param source Card to move.
   * @param destination New parent card; 'root' for the root of the card's
   *   own container, or 'root:project' / 'root:<template>'.
   */
  @write((source, destination) => `Move card ${source} to ${destination}`)
  public async move(source: string, destination: string): Promise<void> {
    await moveCard(this.checkout, source, destination);
  }

  /**
   * Ranks a card right after a sibling.
   * @param cardKey Card to rank.
   * @param afterCardKey Sibling the card goes after.
   */
  @write((cardKey) => `Reorder card ${cardKey}`)
  public async rank(cardKey: string, afterCardKey: string): Promise<void> {
    await rankAfter(this.checkout, cardKey, afterCardKey);
  }

  /**
   * Ranks a card first among its siblings.
   * @param cardKey Card to rank.
   */
  @write((cardKey) => `Rank card ${cardKey} first`)
  public async rankFirst(cardKey: string): Promise<void> {
    await rankFirst(this.checkout, cardKey);
  }

  /**
   * Ranks a card at a position among its siblings.
   * @param cardKey Card to rank.
   * @param index Position; 0 is first.
   */
  @write((cardKey) => `Reorder card ${cardKey}`)
  public async rankAt(cardKey: string, index: number): Promise<void> {
    await rankAt(this.checkout, cardKey, index);
  }

  /**
   * Rebalances the ranks of a card's children.
   * @param parentCardKey Parent card.
   */
  @write((parentCardKey) => `Rebalance children of ${parentCardKey}`)
  public async rebalance(parentCardKey: string): Promise<void> {
    await rebalanceUnder(this.checkout, parentCardKey);
  }

  /** Rebalances the ranks of every card in the project and its templates. */
  @write(() => 'Rebalance project')
  public async rebalanceAll(): Promise<void> {
    await rebalanceAll(this.checkout);
  }

  /**
   * Updates card content (index.adoc) with incoming content.
   * @param cardKey The card to update.
   * @param changedContent New content for the card.
   */
  @write((cardKey) => `Edit content of ${cardKey}`)
  public async edit(cardKey: string, changedContent: string): Promise<void> {
    await editCardContent(this.checkout, cardKey, changedContent);
  }

  /**
   * Updates card metadata.
   * @param cardKey The card to update.
   * @param changedKey Which metadata property was changed.
   * @param newValue New value for the metadata property.
   */
  @write((cardKey) => `Edit metadata of ${cardKey}`)
  public async editField(
    cardKey: string,
    changedKey: string,
    newValue: Exclude<MetadataContent, bigint>,
  ): Promise<void> {
    await editCardMetadata(this.checkout, cardKey, changedKey, newValue);
  }

  /**
   * Transitions a card to a new state, then executes any side effects
   * modules have declared for the transition.
   * @param cardKey Card to transition.
   * @param transitionName Name of the transition to do.
   */
  @write((cardKey) => `Transition card ${cardKey}`)
  public async transition(
    cardKey: string,
    transitionName: string,
  ): Promise<void> {
    await transitionCard(this.checkout, cardKey, transitionName);
  }

  /**
   * Removes a card, with its children, from the project or a template.
   * @param cardKey Card to remove.
   */
  @write((cardKey) => `Remove card ${cardKey}`)
  public async remove(cardKey: string): Promise<void> {
    await removeCard(this.checkout, cardKey);
  }

  /**
   * Adds a label to a card.
   * @param cardKey Card to label.
   * @param label Label to add.
   */
  @write((cardKey, label) => `Add label ${label} to ${cardKey}`)
  public async addLabel(cardKey: string, label: string): Promise<void> {
    await addLabel(this.checkout, cardKey, label);
  }

  /**
   * Removes a label from a card.
   * @param cardKey Card to remove the label from.
   * @param label Label to remove; may be empty if the card has just one.
   */
  @write((cardKey) => `Remove label ${cardKey}`)
  public async removeLabel(cardKey: string, label: string): Promise<void> {
    await removeLabel(this.checkout, cardKey, label);
  }

  /**
   * Links two cards, or a card and an external item ("connector:itemKey").
   * @param source Card (or external item) the link starts from.
   * @param destination Card (or external item) the link points to.
   * @param linkType Link type to use.
   * @param linkDescription Optional description of the link.
   * @param direction 'outbound' (card to target) or 'inbound'; outbound by default.
   */
  @write(
    (source, destination, linkType) =>
      `Create ${linkType} link from ${source} to ${destination}`,
  )
  public async addLink(
    source: string,
    destination: string,
    linkType: string,
    linkDescription?: string,
    direction?: 'outbound' | 'inbound',
  ): Promise<void> {
    await addLink(
      this.checkout,
      source,
      destination,
      linkType,
      linkDescription,
      direction,
    );
  }

  /**
   * Removes a link between two cards, or between a card and an external item.
   * @param source Card (or external item) the link starts from.
   * @param destination Card (or external item) the link points to.
   * @param linkType Link type of the link.
   * @param linkDescription Description of the link, if it has one.
   * @param direction Direction of an external link; auto-detected by default.
   */
  @write((source) => `Remove link ${source}`)
  public async removeLink(
    source: string,
    destination: string,
    linkType?: string,
    linkDescription?: string,
    direction?: 'outbound' | 'inbound',
  ): Promise<void> {
    await removeLink(
      this.checkout,
      source,
      destination,
      linkType,
      linkDescription,
      direction,
    );
  }

  /**
   * Adds an attachment to a card.
   * @param cardKey Card to attach to.
   * @param attachment Attachment name; its base name names the file.
   * @param buffer Attachment data.
   */
  @write((cardKey, attachment) => `Add attachment ${attachment} to ${cardKey}`)
  public async addAttachment(
    cardKey: string,
    attachment: string,
    buffer: Buffer,
  ): Promise<void> {
    await addAttachment(this.checkout, cardKey, attachment, buffer);
  }

  /**
   * Removes an attachment from a card.
   * @param cardKey Card to remove the attachment from.
   * @param attachment File name of the attachment.
   */
  @write((cardKey) => `Remove attachment ${cardKey}`)
  public async removeAttachment(
    cardKey: string,
    attachment?: string,
  ): Promise<void> {
    await removeAttachment(this.checkout, cardKey, attachment);
  }

  /**
   * Renames a card's attachment file.
   * @param cardKey Card whose attachment is renamed.
   * @param fileName Current attachment file name.
   * @param newFileName New attachment file name.
   */
  @write((cardKey) => `Rename attachment of ${cardKey}`)
  public async renameAttachment(
    cardKey: string,
    fileName: string,
    newFileName: string,
  ): Promise<void> {
    await renameCardAttachment(this.checkout, cardKey, fileName, newFileName);
  }

  /**
   * Creates cards in the project from a template, optionally under a parent
   * card. Returns the template's root cards first, in rank order; the rest
   * follow, grouped by parent key and in rank order within a group.
   */
  @write((templateName) => `Create card from template ${templateName}`)
  public async create(
    templateName: string,
    parentCardKey?: string,
  ): Promise<Card[]> {
    return createCard(this.checkout, templateName, parentCardKey);
  }

  /**
   * Creates a card per row of a CSV text (title, template, description,
   * labels and custom field columns), optionally under a parent card.
   * Returns the keys of the cards created.
   */
  @write(() => 'Import cards from CSV')
  public async importCsv(
    csv: string,
    parentCardKey?: string,
  ): Promise<string[]> {
    return importCsv(this.checkout, csv, parentCardKey);
  }

  /** Adds cards of a card type to a template, optionally under a card. */
  @write(
    (cardTypeName, templateName) =>
      `Add cards of type ${cardTypeName} to template ${templateName}`,
  )
  public async addToTemplate(
    cardTypeName: string,
    templateName: string,
    card?: string,
    count?: number,
  ): Promise<string[]> {
    return addCards(this.checkout, cardTypeName, templateName, card, count);
  }

  /** Card keys of the project, the templates or both. */
  @read
  public async list(cardsFrom?: CardLocation): Promise<CardListContainer[]> {
    return listCards(this.checkout, cardsFrom);
  }

  /** One card, with metadata, content, children and attachments. */
  @read
  public async details(cardKey: string): Promise<Card> {
    if (!cardKey) {
      throw new Error(`Mandatory parameter 'cardKey' missing`);
    }
    return findCard(this.checkout, cardKey);
  }

  /** Whether the project, or one of its templates, holds the card. Takes no lock. */
  public has(cardKey: string): boolean {
    return hasCard(this.checkout, cardKey);
  }

  /** The project's root cards. */
  @read
  public async roots(): Promise<Card[]> {
    return rootCards(this.checkout);
  }

  /** The cards of every template, as hierarchies. */
  @read
  public async templateCards(): Promise<TemplateCardTree[]> {
    return templateCardTrees(this.checkout);
  }

  /** Attachments of every card in the project and its templates. */
  @read
  public async attachments(): Promise<CardAttachment[]> {
    return attachments(this.checkout);
  }

  /** The file of one attachment, with its mime type. */
  @read
  public async attachment(
    cardKey: string,
    filename: string,
  ): Promise<AttachmentContent> {
    return attachment(this.checkout, cardKey, filename);
  }

  /** The labels in use, sorted. */
  @read
  public async labels(): Promise<string[]> {
    return labels(this.checkout);
  }

  /** The logic program generated for a card. */
  @read
  public async logicProgram(cardKey: string): Promise<string> {
    return this.checkout.calculationEngine.cardLogicProgram(cardKey);
  }
}
