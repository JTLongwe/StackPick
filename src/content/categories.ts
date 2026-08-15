import type { Ecosystem } from '../types'

/**
 * Curated category taxonomy.
 *
 * Hand-maintained rather than derived from registry keywords. Real packages tag
 * themselves `javascript`, `typescript`, `node`, `utility` — terms that carry no
 * signal — so auto-derived categories look broken.
 *
 * Registry search alone is not good enough to lead a category page. Measured on
 * the live APIs: npm's `keywords:` qualifier returns near-nothing for
 * cryptography and only @ngxs/* plugins for state management, while plain-text
 * search puts @elastic/eui above React and MUI for UI libraries. NuGet's tag
 * search is genuinely good. So each category carries `seeds` — the contenders
 * worth naming — and search supplies discovery below them.
 *
 * Even then, treat the ORDER as meaningless: registry ranking favours
 * incumbents, which is exactly the bias StackPick exists to look past. A
 * category page should lead into a comparison, where the verdict does the work.
 */
export interface Category {
  slug: string
  label: string
  blurb: string
  ecosystems: Ecosystem[]
  /** Plain-text npm query — npm ranks text search better than its own
   *  keywords: qualifier, which buries the real libraries. */
  npmSearch?: string
  /** NuGet's tag search works well; repeated qualifiers act as OR. */
  nugetTags?: string[]
  /** Known contenders, shown above search results. */
  seeds?: Partial<Record<Ecosystem, string[]>>
}

export const categories: Category[] = [
  {
    slug: 'validation',
    label: 'Schema validation',
    blurb: 'Parsing and validating structural data and form input.',
    ecosystems: ['npm', 'nuget'],
    npmSearch: 'schema validation library',
    nugetTags: ['validation', 'fluentvalidation'],
    seeds: {
      npm: ['zod', 'yup', 'joi', 'valibot', 'ajv', 'superstruct'],
      nuget: ['FluentValidation', 'DataAnnotationsValidator'],
    },
  },
  {
    slug: 'testing',
    label: 'Testing',
    blurb: 'Test runners, assertion libraries and mocking.',
    ecosystems: ['npm', 'nuget'],
    npmSearch: 'test runner framework',
    nugetTags: ['testing', 'unittest', 'mocking'],
    seeds: {
      npm: ['vitest', 'jest', 'mocha', 'ava', 'jasmine'],
      nuget: ['xunit', 'NUnit', 'MSTest.TestFramework', 'Moq', 'NSubstitute'],
    },
  },
  {
    slug: 'http',
    label: 'HTTP clients',
    blurb: 'Making requests from browsers and servers.',
    ecosystems: ['npm', 'nuget'],
    npmSearch: 'http client requests',
    nugetTags: ['http', 'rest', 'httpclient'],
    seeds: {
      npm: ['axios', 'ky', 'got', 'node-fetch', 'superagent'],
      nuget: ['RestSharp', 'Flurl.Http', 'Refit'],
    },
  },
  {
    slug: 'logging',
    label: 'Logging',
    blurb: 'Structured and unstructured application logging.',
    ecosystems: ['npm', 'nuget'],
    npmSearch: 'structured logging logger',
    nugetTags: ['logging', 'log'],
    seeds: {
      npm: ['pino', 'winston', 'bunyan', 'loglevel'],
      nuget: ['Serilog', 'NLog', 'log4net'],
    },
  },
  {
    slug: 'ui',
    label: 'UI frameworks',
    blurb: 'Component libraries and design systems.',
    ecosystems: ['npm'],
    npmSearch: 'react component library',
    seeds: {
      npm: ['@mui/material', 'antd', 'vuetify', 'primevue', 'quasar', 'chakra-ui'],
    },
  },
  {
    slug: 'state',
    label: 'State management',
    blurb: 'Where shared application state lives.',
    ecosystems: ['npm'],
    npmSearch: 'state management',
    seeds: {
      npm: ['zustand', 'redux', 'mobx', 'jotai', 'pinia', 'vuex'],
    },
  },
  {
    slug: 'date',
    label: 'Date & time',
    blurb: 'Parsing, formatting and manipulating dates.',
    ecosystems: ['npm', 'nuget'],
    npmSearch: 'date time library',
    nugetTags: ['date', 'time', 'datetime'],
    seeds: {
      npm: ['date-fns', 'dayjs', 'luxon', 'moment'],
      nuget: ['NodaTime'],
    },
  },
  {
    slug: 'serialization',
    label: 'Serialization',
    blurb: 'JSON and other wire formats.',
    ecosystems: ['npm', 'nuget'],
    npmSearch: 'json serialization parser',
    nugetTags: ['json', 'serialization', 'serializer'],
    seeds: {
      npm: ['superjson', 'devalue', 'flatted'],
      nuget: ['Newtonsoft.Json', 'System.Text.Json', 'protobuf-net', 'MessagePack'],
    },
  },
  {
    slug: 'orm',
    label: 'Data access & ORM',
    blurb: 'Talking to databases.',
    ecosystems: ['npm', 'nuget'],
    npmSearch: 'orm query builder database',
    nugetTags: ['orm', 'sql', 'database'],
    seeds: {
      npm: ['prisma', 'drizzle-orm', 'typeorm', 'sequelize', 'knex'],
      nuget: ['Dapper', 'Microsoft.EntityFrameworkCore', 'NHibernate'],
    },
  },
  {
    slug: 'cryptography',
    label: 'Cryptography',
    blurb: 'Hashing, encryption, signing and tokens.',
    ecosystems: ['npm', 'nuget'],
    npmSearch: 'cryptography encryption hashing',
    nugetTags: ['cryptography', 'encryption', 'jwt'],
    seeds: {
      npm: ['bcrypt', 'jsonwebtoken', 'jose', '@noble/hashes', 'argon2'],
      nuget: ['BouncyCastle.Cryptography', 'System.IdentityModel.Tokens.Jwt', 'BCrypt.Net-Next'],
    },
  },
]

export const categoryBySlug = (slug: string) => categories.find(c => c.slug === slug)

/** The query string a registry understands for this category. */
export function categoryQuery(category: Category, ecosystem: Ecosystem): string | null {
  if (!category.ecosystems.includes(ecosystem)) return null

  if (ecosystem === 'npm') return category.npmSearch ?? null

  const tags = category.nugetTags
  return tags?.length ? tags.map(t => `tags:${t}`).join(' ') : null
}

export const categorySeeds = (category: Category, ecosystem: Ecosystem): string[] =>
  category.seeds?.[ecosystem] ?? []
