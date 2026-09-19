import { z } from 'zod';
/** Null/omission explicitly preserves the legacy appearance. IDs never encode team. */
export const portraitIdSchema = z.string().regex(/^c9-face-(0[1-9]|[12]\d|30)$/).nullable().optional();

/** Supports explicit saved-template identity without treating omission as removal. */
export function savedPortraitId(row: {portraitId?: unknown; appearance?: {portraitId?: unknown}}): string | null | undefined {
  const top = portraitIdSchema.parse(row.portraitId);
  const nested = portraitIdSchema.parse(row.appearance?.portraitId);
  if (top !== undefined && nested !== undefined && top !== nested) throw new Error('Conflicting saved portrait identities');
  return top === undefined ? nested : top;
}
