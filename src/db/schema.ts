import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  boolean,
  pgEnum,
  integer,
  primaryKey,
  unique,
  index,
  smallint,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const importanceLevel = pgEnum('importance_level', ['low', 'medium', 'high', 'critical'])

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  emailVerified: boolean('email_verified').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const technologies = pgTable('technologies', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  githubRepoUrl: text('github_repo_url').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  category: text('category'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const userTechPreferences = pgTable(
  'user_tech_preferences',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    techId: uuid('tech_id')
      .notNull()
      .references(() => technologies.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.techId] })],
)

export const releaseUpdates = pgTable(
  'release_updates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    techId: uuid('tech_id')
      .notNull()
      .references(() => technologies.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    title: text('title'),
    summary: text('summary'),
    newFeatures: jsonb('new_features').$type<string[]>(),
    breakingChanges: jsonb('breaking_changes').$type<string[]>(),
    securityNotes: jsonb('security_notes').$type<string[]>(),
    deprecations: jsonb('deprecations').$type<string[]>(),
    migrationSteps: jsonb('migration_steps').$type<string[]>(),
    impactSummary: text('impact_summary'),
    recommendedAction: text('recommended_action'),
    releaseSignals: jsonb('release_signals').$type<string[]>(),
    codeSnippet: text('code_snippet'),
    importanceLevel: importanceLevel('importance_level').default('medium'),
    summaryModel: text('summary_model'),
    summarizedAt: timestamp('summarized_at'),
    rawReleaseBody: text('raw_release_body'),
    isPrerelease: boolean('is_prerelease').notNull().default(false),
    rawReleaseUrl: text('raw_release_url'),
    publishedAt: timestamp('published_at'),
    fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('release_updates_tech_version_unique').on(t.techId, t.version),
    index('release_updates_tech_published_idx').on(t.techId, sql`${t.publishedAt} DESC`),
    index('release_updates_published_idx').on(sql`${t.publishedAt} DESC`, sql`${t.id} DESC`),
    index('release_updates_signals_idx').using('gin', t.releaseSignals),
  ],
)

export type ReleaseFetchRunDetail = {
  tech: string
  inserted: number
  errors: number
}

export const releaseFetchRuns = pgTable(
  'release_fetch_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    trigger: text('trigger').notNull(),
    status: text('status').notNull().default('running'),
    technologiesScanned: integer('technologies_scanned').notNull().default(0),
    releasesInserted: integer('releases_inserted').notNull().default(0),
    errors: integer('errors').notNull().default(0),
    details: jsonb('details').$type<ReleaseFetchRunDetail[]>(),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    finishedAt: timestamp('finished_at'),
  },
  (t) => [index('release_fetch_runs_started_idx').on(sql`${t.startedAt} DESC`)],
)

export const userReadReleases = pgTable(
  'user_read_releases',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releaseUpdates.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.releaseId] })],
)

export const releaseVotes = pgTable(
  'release_votes',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    releaseId: uuid('release_id')
      .notNull()
      .references(() => releaseUpdates.id, { onDelete: 'cascade' }),
    value: smallint('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.releaseId] }),
    check('release_votes_value_check', sql`${t.value} in (-1, 1)`),
    index('release_votes_release_idx').on(t.releaseId),
  ],
)

export const digestSubscribers = pgTable(
  'digest_subscribers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    stackSlug: text('stack_slug'),
    source: text('source').notNull().default('public'),
    unsubscribeToken: uuid('unsubscribe_token').notNull().unique().defaultRandom(),
    lastSentAt: timestamp('last_sent_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('digest_subscribers_created_idx').on(sql`${t.createdAt} DESC`),
    index('digest_subscribers_stack_idx').on(t.stackSlug),
  ],
)

export const userWebhooks = pgTable(
  'user_webhooks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // 'slack' | 'discord'
    url: text('url').notNull(),
    minImportance: importanceLevel('min_importance').notNull().default('high'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('user_webhooks_user_unique').on(t.userId)],
)

// BetterAuth tables
export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  idToken: text('id_token'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
