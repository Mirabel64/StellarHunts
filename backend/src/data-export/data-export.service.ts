import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DataSource, EntityMetadata } from 'typeorm';
import { User } from '../auth/entities/user.entity';

export const DATA_EXPORT_SCHEMA_VERSION = '1.0';

export interface UserDataExport {
  schemaVersion: string;
  generatedAt: string;
  user: Record<string, unknown>;
  records: Record<string, Record<string, unknown>[]>;
}

/**
 * Column names that must never be exported, whatever table they appear in.
 *
 * These are credentials and credential-equivalents. The exported document is
 * handed to the user and may be forwarded or stored insecurely, so a hashed
 * token or password is still treated as sensitive: it is useful to an
 * attacker who already has the account, and useless to the user.
 */
const SENSITIVE_COLUMN_PATTERN =
  /^(password|passwordHash|token|tokenHash|accessToken|refreshToken|apiKey|keyHash|secret|jti|signature|nonce|challenge)$/i;

/** Tables that are operator data, not the requesting user's personal data. */
const EXCLUDED_TABLES = new Set(['admins']);

/** Keys redacted inside JSON columns (token metadata, audit metadata, ...). */
const SENSITIVE_KEY_PATTERN =
  /(password|token|secret|api[-_]?key|private[-_]?key|signature|jti|nonce)/i;

/**
 * Builds a GDPR-style export of everything the product stores about one user.
 *
 * The list of tables is derived from TypeORM metadata rather than a
 * hand-written allow-list: every entity that has a `userId` column is
 * included automatically, so a new feature table is exported the day its
 * entity lands instead of silently being omitted. The wallet-address columns
 * are queried too, which covers records created before an address was linked
 * to the account.
 *
 * What the metadata cannot decide is what is *sensitive*, so that is an
 * explicit deny-list: credential columns are dropped, and JSON payloads are
 * deep-scrubbed for keys that look like secrets.
 */
@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);

  constructor(private readonly dataSource: DataSource) {}

  async exportForUser(userId: string): Promise<UserDataExport> {
    const userRepository = this.dataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const records: Record<string, Record<string, unknown>[]> = {};

    for (const metadata of this.personalDataEntities()) {
      const rows = await this.loadPersonalRows(metadata, userId, user.walletAddress);
      if (rows.length > 0) {
        records[metadata.tableName] = rows;
      }
    }

    return {
      schemaVersion: DATA_EXPORT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      user: this.sanitizeRow(user as unknown as Record<string, unknown>),
      records,
    };
  }

  /**
   * Entity metadata that represents rows belonging to a single user.
   *
   * Duplicate metadata for the same table is collapsed: a couple of tables
   * are (incorrectly) mapped twice in this codebase, and iterating both would
   * return the same rows twice under the same key.
   */
  private personalDataEntities(): EntityMetadata[] {
    const seenTables = new Set<string>();
    const entities: EntityMetadata[] = [];

    for (const metadata of this.dataSource.entityMetadatas) {
      if (EXCLUDED_TABLES.has(metadata.tableName)) continue;
      if (metadata.tableName === 'users') continue; // exported explicitly
      if (seenTables.has(metadata.tableName)) continue;

      const hasUserId = metadata.columns.some(
        (column) => column.propertyName === 'userId',
      );
      const hasWalletColumn = metadata.columns.some((column) =>
        ['walletAddress', 'address'].includes(column.propertyName),
      );

      if (!hasUserId && !hasWalletColumn) continue;

      seenTables.add(metadata.tableName);
      entities.push(metadata);
    }

    return entities.sort((a, b) => a.tableName.localeCompare(b.tableName));
  }

  private async loadPersonalRows(
    metadata: EntityMetadata,
    userId: string,
    walletAddress?: string | null,
  ): Promise<Record<string, unknown>[]> {
    const columns = metadata.columns.filter(
      (column) => !SENSITIVE_COLUMN_PATTERN.test(column.propertyName),
    );

    if (columns.length === 0) return [];

    const hasUserId = metadata.columns.some(
      (column) => column.propertyName === 'userId',
    );
    const walletColumn = metadata.columns.find((column) =>
      ['walletAddress', 'address'].includes(column.propertyName),
    );

    const where: Record<string, unknown>[] = [];
    if (hasUserId) where.push({ userId });
    if (walletColumn && walletAddress) {
      where.push({ [walletColumn.propertyName]: walletAddress });
    }
    if (where.length === 0) return [];

    const select: Record<string, boolean> = {};
    for (const column of columns) {
      select[column.propertyName] = true;
    }

    const order: Record<string, 'ASC' | 'DESC'> = {};
    const createdAt = metadata.columns.find(
      (column) => column.propertyName === 'createdAt',
    );
    if (createdAt) order.createdAt = 'DESC';

    try {
      const rows = await this.dataSource.getRepository(metadata.target).find({
        where,
        select,
        ...(Object.keys(order).length > 0 ? { order } : {}),
      });

      return rows.map((row) =>
        this.sanitizeRow(row as unknown as Record<string, unknown>),
      );
    } catch (error) {
      // An export should not fail wholesale because one legacy table is
      // missing a column the entity metadata expects. Log the table name —
      // never a row — and continue with the rest of the data.
      this.logger.warn(
        `data_export_table_failed table=${metadata.tableName} error=${
          error instanceof Error ? error.name : typeof error
        }`,
      );
      return [];
    }
  }

  private sanitizeRow(
    row: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      if (SENSITIVE_COLUMN_PATTERN.test(key)) continue;
      sanitized[key] = this.redactValue(value);
    }

    return sanitized;
  }

  private redactValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactValue(item));
    }

    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const redacted: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(
        value as Record<string, unknown>,
      )) {
        redacted[key] = SENSITIVE_KEY_PATTERN.test(key)
          ? '[redacted]'
          : this.redactValue(nested);
      }
      return redacted;
    }

    return value;
  }
}
