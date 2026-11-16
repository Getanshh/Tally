import { escapeXml } from "./xml/escape";

/**
 * Builders for inline TDL definitions embedded in export requests.
 *
 * IMPORTANT: `fetch`, `compute` and `filters` are TDL *expressions*. They must only come
 * from constants in names.ts / our own code — never from Claude or user input. When a
 * user-supplied value has to appear inside a TDL formula (Phase 1 filters), it needs
 * TDL string quoting in addition to XML escaping. VERIFY-ON-TALLY: TDL quoting rules.
 */
export interface CollectionDef {
  name: string;
  type: string;
  fetch?: readonly string[];
  compute?: readonly string[];
  /** Names of SYSTEM formulas defined in `formulas`, applied as collection filters. */
  filters?: readonly string[];
  /** Map of formula name → TDL expression. */
  formulas?: Readonly<Record<string, string>>;
  /** e.g. ChildOf for ledger-vouchers style collections. */
  childOf?: string;
}

export function buildCollectionTdl(def: CollectionDef): string {
  const parts: string[] = [`<TYPE>${escapeXml(def.type)}</TYPE>`];
  if (def.childOf !== undefined) parts.push(`<CHILDOF>${escapeXml(def.childOf)}</CHILDOF>`);
  if (def.fetch?.length) parts.push(`<FETCH>${escapeXml(def.fetch.join(", "))}</FETCH>`);
  for (const c of def.compute ?? []) parts.push(`<COMPUTE>${escapeXml(c)}</COMPUTE>`);
  if (def.filters?.length) parts.push(`<FILTERS>${escapeXml(def.filters.join(", "))}</FILTERS>`);
  const collection =
    `<COLLECTION NAME="${escapeXml(def.name)}" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">` +
    parts.join("") +
    `</COLLECTION>`;
  const formulas = Object.entries(def.formulas ?? {})
    .map(
      ([name, expr]) =>
        `<SYSTEM TYPE="Formulae" NAME="${escapeXml(name)}" ISMODIFY="No" ISFIXED="No" ISINTERNAL="No">${escapeXml(expr)}</SYSTEM>`,
    )
    .join("");
  return collection + formulas;
}
