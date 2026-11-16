import { z } from "zod";
import type { TallyConnectionConfig } from "./config";
import { TallyTransport, type FetchLike } from "./transport";
import { assertReadOnlyEnvelope, buildExportEnvelope, type ExportRequest } from "./envelope";
import { parseExportResponse } from "./responses";
import { requestCatalog } from "./requests";
import { RESPONSE_ELEMENTS, SERVER_BANNER_PATTERN } from "./names";
import type { TallyEncoding } from "./xml/encoding";
import { attrOf, findAll, isNode, textOf, type XmlNode, type XmlValue } from "./xml/parse";
import { fromTallyDate } from "./values";
import { TallyError, TallyResponseError } from "./errors";

export const CompanySchema = z.object({
  name: z.string().min(1),
  guid: z.string().nullable(),
  /** Financial year start, ISO date. */
  startingFrom: z.string().nullable(),
  booksFrom: z.string().nullable(),
  endingAt: z.string().nullable(),
});
export type Company = z.infer<typeof CompanySchema>;

export const HealthSchema = z.object({
  reachable: z.boolean(),
  url: z.string(),
  /** Raw banner from GET /, e.g. "TallyPrime Server is Running". */
  serverBanner: z.string().nullable(),
  product: z.string().nullable(),
  /** Exact Tally version if Tally exposes it via TDL, otherwise null. VERIFY-ON-TALLY */
  version: z.string().nullable(),
  companies: z.array(CompanySchema),
  /** Company currently selected in the Tally UI (if detectable). Never used to target writes. */
  activeCompany: z.string().nullable(),
  latencyMs: z.number().nullable(),
  error: z.string().nullable(),
  warnings: z.array(z.string()),
});
export type Health = z.infer<typeof HealthSchema>;

export interface ExportResult {
  root: XmlNode;
  raw: string;
  /** Encoding Tally used for the response bytes. */
  encoding: TallyEncoding;
  durationMs: number;
}

/**
 * Read-only Tally client. Every request is an Export envelope and is checked by
 * assertReadOnlyEnvelope() before it leaves the process. This is the ONLY Tally client the
 * MCP server is allowed to use.
 */
export class TallyReadClient {
  private readonly transport: TallyTransport;

  constructor(
    private readonly config: TallyConnectionConfig,
    fetchImpl?: FetchLike,
  ) {
    this.transport = new TallyTransport(config, fetchImpl);
  }

  get url(): string {
    return this.transport.url;
  }

  /** Send a structured export request. */
  async export(req: ExportRequest): Promise<ExportResult> {
    return this.exportRaw(buildExportEnvelope(req));
  }

  /** Send a pre-built XML envelope. Rejected unless it is a plain Export request. */
  async exportRaw(xml: string): Promise<ExportResult> {
    assertReadOnlyEnvelope(xml);
    const res = await this.transport.post(xml, { retries: this.config.readRetries });
    return {
      root: parseExportResponse(res.text),
      raw: res.text,
      encoding: res.encoding,
      durationMs: res.durationMs,
    };
  }

  /** Raw response to a plain GET on the port (the "Server is Running" banner). */
  async serverBanner(): Promise<{ text: string; encoding: TallyEncoding }> {
    const res = await this.transport.getBanner();
    return { text: res.text, encoding: res.encoding };
  }

  /** Loaded companies (Tally's Company collection lists only companies currently open). */
  async listLoadedCompanies(): Promise<{
    companies: Company[];
    activeCompany: string | null;
    version: string | null;
  }> {
    const { root } = await this.export(requestCatalog.loadedCompanies());
    return parseCompanies(root);
  }

  /** Connection status, Tally product/version, loaded companies, active company. Never throws. */
  async health(): Promise<Health> {
    const base: Health = {
      reachable: false,
      url: this.url,
      serverBanner: null,
      product: null,
      version: null,
      companies: [],
      activeCompany: null,
      latencyMs: null,
      error: null,
      warnings: [],
    };
    const started = Date.now();
    try {
      const banner = await this.transport.getBanner();
      base.reachable = true;
      base.latencyMs = Date.now() - started;
      base.serverBanner = banner.text.replace(/<[^>]+>/g, "").trim() || null;
      const m = SERVER_BANNER_PATTERN.exec(banner.text);
      base.product = m?.[1]?.trim() ?? null;
      if (!m)
        base.warnings.push("Port answered but the banner does not look like Tally. Is the port correct?");
    } catch (err) {
      base.error = err instanceof Error ? err.message : String(err);
      return HealthSchema.parse(base);
    }
    try {
      const { companies, activeCompany, version } = await this.listLoadedCompanies();
      base.companies = companies;
      base.activeCompany = activeCompany;
      base.version = version;
      if (companies.length === 0) base.warnings.push("Tally is running but no company is loaded.");
    } catch (err) {
      base.error =
        err instanceof TallyResponseError || err instanceof TallyError
          ? err.message
          : `Unexpected error listing companies: ${String(err)}`;
    }
    return HealthSchema.parse(base);
  }
}

function optionalDate(value: XmlValue | undefined): string | null {
  const t = textOf(value)?.trim();
  if (!t) return null;
  try {
    return fromTallyDate(t);
  } catch {
    return null;
  }
}

export function parseCompanies(root: XmlNode): {
  companies: Company[];
  activeCompany: string | null;
  version: string | null;
} {
  const companies: Company[] = [];
  let activeCompany: string | null = null;
  let version: string | null = null;
  for (const node of findAll(root, RESPONSE_ELEMENTS.COMPANY)) {
    if (!isNode(node)) continue;
    const name = (textOf(node["NAME"]) ?? attrOf(node, "NAME") ?? "").trim();
    if (!name) continue;
    companies.push(
      CompanySchema.parse({
        name,
        guid: textOf(node["GUID"])?.trim() || null,
        startingFrom: optionalDate(node["STARTINGFROM"]),
        booksFrom: optionalDate(node["BOOKSFROM"]),
        endingAt: optionalDate(node["ENDINGAT"]),
      }),
    );
    if (textOf(node["TBISACTIVE"])?.trim().toLowerCase() === "yes") activeCompany = name;
    version ??= textOf(node["TBVERSION"])?.trim() || null;
  }
  return { companies, activeCompany, version };
}
