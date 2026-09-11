import { and, eq, ilike, inArray, or, desc } from "drizzle-orm";
import { person, personIdentity } from "@helloo/db/schema";
import { withTenant, ensureHello, type Tx } from "@helloo/db";
import type { AppEnv } from "@helloo/core";

/**
 * People-graph reads (v1 People / entity resolution). Runs inside the RLS tenant, so a query only
 * ever sees the caller's own contacts. `findPeople` matches on a person's name OR any of their
 * identities (so searching an email or handle finds the person it belongs to).
 */

export interface PersonIdentityRecord {
  channel: string;
  value: string;
}
export interface PersonRecord {
  id: string;
  displayName: string;
  kind: string;
  isSelf: boolean;
  mentions: number;
  identities: PersonIdentityRecord[];
}

function group(
  people: { id: string; displayName: string; kind: string; isSelf: boolean; mentions: number }[],
  idents: { personId: string; channel: string; value: string }[],
): PersonRecord[] {
  const byPerson = new Map<string, PersonIdentityRecord[]>();
  for (const i of idents) {
    const list = byPerson.get(i.personId) ?? [];
    list.push({ channel: i.channel, value: i.value });
    byPerson.set(i.personId, list);
  }
  return people.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    kind: p.kind,
    isSelf: p.isSelf,
    mentions: p.mentions,
    identities: byPerson.get(p.id) ?? [],
  }));
}

/** Find contacts by name or by any identity (email/handle/number), with their resolved surfaces. */
export async function findPeople(
  env: AppEnv,
  ownerId: string,
  query: string,
  limit = 8,
): Promise<PersonRecord[]> {
  const q = query.trim();
  if (q.length === 0) return [];
  const like = `%${q}%`;
  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const byName = await tx
      .select({ id: person.id })
      .from(person)
      .where(or(ilike(person.norm, like), ilike(person.displayName, like)))
      .limit(limit);
    const byIdentity = await tx
      .select({ id: personIdentity.personId })
      .from(personIdentity)
      .where(or(ilike(personIdentity.norm, like), ilike(personIdentity.value, like)))
      .limit(limit);

    const ids = [...new Set([...byName.map((r) => r.id), ...byIdentity.map((r) => r.id)])].slice(0, limit);
    if (ids.length === 0) return [];

    const people = await tx
      .select({
        id: person.id,
        displayName: person.displayName,
        kind: person.kind,
        isSelf: person.isSelf,
        mentions: person.mentions,
      })
      .from(person)
      .where(inArray(person.id, ids));
    const idents = await tx
      .select({ personId: personIdentity.personId, channel: personIdentity.channel, value: personIdentity.value })
      .from(personIdentity)
      .where(inArray(personIdentity.personId, ids));
    return group(people, idents).sort((a, b) => b.mentions - a.mentions);
  });
}

/** The user's most-referenced contacts (for "who do I know" / overview). */
export async function listPeople(env: AppEnv, ownerId: string, limit = 20): Promise<PersonRecord[]> {
  return withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const people = await tx
      .select({
        id: person.id,
        displayName: person.displayName,
        kind: person.kind,
        isSelf: person.isSelf,
        mentions: person.mentions,
      })
      .from(person)
      .orderBy(desc(person.mentions))
      .limit(limit);
    if (people.length === 0) return [];
    const idents = await tx
      .select({ personId: personIdentity.personId, channel: personIdentity.channel, value: personIdentity.value })
      .from(personIdentity)
      .where(inArray(personIdentity.personId, people.map((p) => p.id)));
    return group(people, idents);
  });
}

// ── Auto-fill (entity resolution) ────────────────────────────────────────────
// Turn a raw (name, channel, value) into a person, unifying across surfaces:
//   1. identity already known → that person (nothing to do)
//   2. else a person with the same normalized NAME exists → attach this identity to them (unify)
//   3. else create a new person + this identity
// Name-based unification is intentionally aggressive (two people sharing a normalized name merge —
// a known v1 tradeoff of the one-person-per-normalized-name model).

export type ResolveAction = "created" | "linked" | "existing";
export interface ImportSummary {
  scanned: number;
  created: number;
  linked: number;
  existing: number;
}
export interface ContactInput {
  name: string;
  channel: string;
  value: string;
}

async function resolveInTx(
  tx: Tx,
  ownerId: string,
  helloId: string,
  input: ContactInput,
): Promise<ResolveAction> {
  const normValue = input.value.toLowerCase().trim();
  const normName = input.name.toLowerCase().trim();
  if (normValue.length === 0) return "existing";

  const known = await tx
    .select({ personId: personIdentity.personId })
    .from(personIdentity)
    .where(and(eq(personIdentity.channel, input.channel), eq(personIdentity.norm, normValue)))
    .limit(1);
  if (known[0]) return "existing";

  let personId: string | null = null;
  let action: ResolveAction = "linked";
  if (normName.length > 0) {
    const byName = await tx.select({ id: person.id }).from(person).where(eq(person.norm, normName)).limit(1);
    personId = byName[0]?.id ?? null;
  }
  if (!personId) {
    const chosenNorm = normName.length > 0 ? normName : normValue;
    const created = await tx
      .insert(person)
      .values({
        ownerId,
        helloId,
        displayName: input.name.length > 0 ? input.name : input.value,
        norm: chosenNorm,
        mentions: 0,
      })
      .onConflictDoNothing({ target: [person.ownerId, person.norm] })
      .returning({ id: person.id });
    if (created[0]) {
      personId = created[0].id;
      action = "created";
    } else {
      const again = await tx.select({ id: person.id }).from(person).where(eq(person.norm, chosenNorm)).limit(1);
      personId = again[0]?.id ?? null;
    }
  }
  if (!personId) return "existing";

  await tx
    .insert(personIdentity)
    .values({ ownerId, helloId, personId, channel: input.channel, value: input.value, norm: normValue })
    .onConflictDoNothing({ target: [personIdentity.ownerId, personIdentity.channel, personIdentity.norm] });
  return action;
}

/** Resolve a batch of contacts into the people graph (one tenant transaction). */
export async function resolvePeople(
  env: AppEnv,
  ownerId: string,
  inputs: ContactInput[],
): Promise<ImportSummary> {
  const summary: ImportSummary = { scanned: inputs.length, created: 0, linked: 0, existing: 0 };
  if (inputs.length === 0) return summary;
  await withTenant(env.APP_DATABASE_URL, ownerId, async (tx) => {
    const helloId = await ensureHello(tx, ownerId);
    for (const input of inputs) {
      const action = await resolveInTx(tx, ownerId, helloId, input);
      summary[action] += 1;
    }
  });
  return summary;
}
