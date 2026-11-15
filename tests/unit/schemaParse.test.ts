import { describe, it, expect } from 'vitest'
import { parseSchema, type ParseResult } from '../../src/renderer/src/utils/schemaParse'

const PRISMA = `
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DB") }

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]
}

model Post {
  id       Int    @id @default(autoincrement())
  title    String
  authorId Int
  author   User   @relation(fields: [authorId], references: [id])
}
`.trim()

const DBML = `
Table users {
  id integer [pk]
  email varchar [unique]
}

Table posts {
  id integer [pk]
  title varchar
  user_id integer
}

Ref: posts.user_id > users.id
`.trim()

const DDL = `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  user_id INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
`.trim()

function counts(r: ParseResult): { kind: string; tables: number; refs: number } {
  if (!r.ok) throw new Error(`expected ok, got: ${r.reason}`)
  return { kind: r.kind, tables: r.model.tables.length, refs: r.model.refs.length }
}

describe('parseSchema', () => {
  it.each([
    ['prisma', PRISMA],
    ['dbml', DBML],
    ['ddl', DDL],
  ])('%s → 2 tables, 1 ref', (kind, src) => {
    expect(counts(parseSchema(src))).toEqual({ kind, tables: 2, refs: 1 })
  })

  it('DDL with inline REFERENCES + ON DELETE CASCADE picks up every FK', () => {
    // Regression: earlier parser greedily consumed REFERENCES as part of the column type,
    // leaving the inline-FK regex no match. Real-world DDL (Postgres-style with REFERENCES +
    // ON DELETE) must show the relation.
    const ECOM_DDL = `
CREATE TABLE users (
  id    SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL
);
CREATE TABLE addresses (
  id      SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city    VARCHAR(100) NOT NULL
);
CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id),
  address_id  INT REFERENCES addresses(id),
  total       DECIMAL(10,2) NOT NULL
);
`.trim()
    const r = parseSchema(ECOM_DDL)
    // Three FKs: addresses.user_id → users, orders.user_id → users, orders.address_id → addresses.
    expect(counts(r)).toEqual({ kind: 'ddl', tables: 3, refs: 3 })
    const refs = r.ok ? r.model.refs.map((x) => `${x.from.table}.${x.from.col}->${x.to.table}.${x.to.col}`) : []
    expect(refs.sort()).toEqual(['addresses.user_id->users.id', 'orders.address_id->addresses.id', 'orders.user_id->users.id'])
  })

  it('DDL with ALTER TABLE ADD FOREIGN KEY picks up the FK', () => {
    const ALTER_DDL = `
CREATE TABLE users ( id INT PRIMARY KEY );
CREATE TABLE posts ( id INT PRIMARY KEY, user_id INT );
ALTER TABLE posts ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);
`.trim()
    expect(counts(parseSchema(ALTER_DDL))).toEqual({ kind: 'ddl', tables: 2, refs: 1 })
  })

  it('rejects plain text and empty buffers', () => {
    const plain = parseSchema('just plain text, no schema here')
    expect(plain.ok).toBe(false)
    expect(plain.ok ? '' : plain.reason).toMatch(/Could not recognise Prisma \/ DBML \/ DDL/)
    expect(parseSchema('   \n').ok).toBe(false)
  })
})
