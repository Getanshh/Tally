import { XMLParser } from "fast-xml-parser";
import { TallyBadResponseError } from "../errors";
import { sanitizeTallyXml } from "./encoding";

/** A parsed XML node. Values are ALWAYS strings — amounts/GUIDs are never auto-converted to numbers. */
export type XmlNode = { [key: string]: XmlValue };
export type XmlValue = string | XmlNode | XmlValue[];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: false,
  ignoreDeclaration: true,
});

export function parseTallyXml(xml: string): XmlNode {
  const cleaned = sanitizeTallyXml(xml);
  try {
    const result: unknown = parser.parse(cleaned, true);
    if (result === null || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("root is not an element");
    }
    return result as XmlNode;
  } catch (err) {
    throw new TallyBadResponseError(err instanceof Error ? err.message : String(err), xml);
  }
}

export function asArray(value: XmlValue | undefined): XmlValue[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function isNode(value: XmlValue | undefined): value is XmlNode {
  return value !== undefined && typeof value === "object" && !Array.isArray(value);
}

/** Text of an element, whether it parsed as a bare string or as {"#text": "...", "@_TYPE": "String"}. */
export function textOf(value: XmlValue | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return textOf(value[0]);
  const text = value["#text"];
  if (typeof text === "string") return text;
  // An element with only attributes, e.g. <NAME TYPE="String"/>, has empty text.
  return Object.keys(value).every((k) => k.startsWith("@_")) ? "" : undefined;
}

export function attrOf(value: XmlValue | undefined, name: string): string | undefined {
  if (!isNode(value)) return undefined;
  const attr = value[`@_${name}`];
  return typeof attr === "string" ? attr : undefined;
}

/** Depth-first search for every element with the given tag name. */
export function findAll(root: XmlValue, tag: string): XmlValue[] {
  const out: XmlValue[] = [];
  const visit = (node: XmlValue): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isNode(node)) return;
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith("@_") || key === "#text") continue;
      if (key === tag) out.push(...asArray(child));
      visit(child);
    }
  };
  visit(root);
  return out;
}

export function findFirst(root: XmlValue, tag: string): XmlValue | undefined {
  return findAll(root, tag)[0];
}
