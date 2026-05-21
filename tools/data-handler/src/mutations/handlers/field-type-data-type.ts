// tools/data-handler/src/mutations/handlers/field-type-data-type.ts

import { join } from 'node:path';

import type { Handler, MutationContext } from '../handler.js';
import type { CascadePreview } from '../types.js';
import { resourceNameToString } from '../../utils/resource-utils.js';
import {
  allowed,
  fromDate,
  fromNumber,
  fromString,
} from '../../utils/value-utils.js';
import type {
  DataType,
  FieldType,
} from '../../interfaces/resource-interfaces.js';
import type { Card, MetadataContent } from '../../interfaces/project-interfaces.js';

const SHORT_TEXT_MAX_LENGTH = 80;

export class FieldTypeDataTypeHandler implements Handler {
  readonly isBreaking = true;

  matches(ctx: MutationContext): boolean {
    return (
      ctx.input.kind === 'edit' &&
      ctx.input.target.type === 'fieldTypes' &&
      ctx.input.updateKey.key === 'dataType' &&
      ctx.input.operation.name === 'change'
    );
  }

  async preview(ctx: MutationContext): Promise<CascadePreview> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('FieldTypeDataTypeHandler: non-edit input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(fieldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${fieldName}' not found`);
    }
    const from = (resource.data as FieldType).dataType;
    const to = (ctx.input.operation as { to: DataType }).to;
    const cards = this.cardsWithField(ctx, fieldName);

    // Detect data-loss: if any card has a non-null value that won't survive
    // the conversion, flag it. shortText↔longText is the lossless case.
    let willLoseData = false;
    for (const card of cards) {
      const value = card.metadata?.[fieldName];
      if (value === undefined || value === null) continue;
      const converted = this.tryConvert(value, from, to);
      if (converted === null) {
        willLoseData = true;
        break;
      }
    }

    return {
      affectedCardCount: cards.length,
      affectedLinkCount: 0,
      affectedCalculationCount: 0,
      affectedHandlebarFileCount: 0,
      dataLossExpected: willLoseData,
      summary: `Convert '${fieldName}' from ${from} to ${to} on ${cards.length} cards.`,
    };
  }

  async apply(ctx: MutationContext): Promise<void> {
    if (ctx.input.kind !== 'edit') {
      throw new Error('FieldTypeDataTypeHandler: non-edit input');
    }
    const fieldName = resourceNameToString(ctx.input.target);
    const resource = ctx.project.resources.byType(fieldName, 'fieldTypes');
    if (!resource) {
      throw new Error(`Field type '${fieldName}' not found`);
    }
    const from = (resource.data as FieldType).dataType;
    const to = (ctx.input.operation as { to: DataType }).to;

    if (!allowed(from, to)) {
      throw new Error(
        `Cannot change data type from '${from}' to '${to}' (no conversion allowed)`,
      );
    }

    // 1. Convert every card's value.
    for (const card of this.cardsWithField(ctx, fieldName)) {
      const metadata = card.metadata!;
      const value = metadata[fieldName];
      if (value === undefined || value === null) continue;
      const converted = this.tryConvert(value, from, to);
      metadata[fieldName] = converted as MetadataContent;
      await ctx.project.updateCardMetadata(card, metadata);
    }

    // 2. Apply the resource-definition change.
    await resource.update(ctx.input.updateKey, ctx.input.operation);
  }

  async affectedFilePaths(ctx: MutationContext): Promise<string[]> {
    if (ctx.input.kind !== 'edit') return [];
    const fieldName = resourceNameToString(ctx.input.target);
    return this.cardsWithField(ctx, fieldName).map((c) =>
      join(c.path, 'index.json'),
    );
  }

  private cardsWithField(ctx: MutationContext, fieldName: string): Card[] {
    const all = [
      ...ctx.project.cards(undefined),
      ...ctx.project.allTemplateCards(),
    ];
    return all.filter((c) => c.metadata && fieldName in c.metadata);
  }

  /**
   * Pure value conversion. Returns null when conversion fails (caller writes
   * null to the card metadata). The semantics mirror the existing
   * FieldTypeResource.doConvertValue.
   */
  private tryConvert(value: unknown, from: DataType, to: DataType): unknown {
    if (from === to) return value;
    if (from === 'date' || from === 'dateTime') {
      return fromDate(value, to);
    }
    if (from === 'integer' || from === 'number') {
      return fromNumber(value, to);
    }
    if (from === 'shortText' || from === 'longText') {
      return fromString(value, to);
    }
    if (to === 'shortText' || to === 'longText') {
      let str = String(value).replace(/(\\")/g, '');
      if (to === 'shortText' && str.length > SHORT_TEXT_MAX_LENGTH) {
        return null;
      }
      return str;
    }
    return null;
  }
}
