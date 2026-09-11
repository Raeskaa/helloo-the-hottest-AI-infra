import { ilike, inArray, or, desc } from "drizzle-orm";
import { person, personIdentity } from "@helloo/db/schema";
import { withTenant } from "@helloo/db";
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
