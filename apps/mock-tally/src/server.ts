import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { decodeTallyResponse, escapeXml } from "@tally-bridge/tally-client";
import { loadFixtures, type Fixture } from "./fixtures";
import { extractRequestKey, matchFixture, type RequestKey } from "./matcher";

export interface MockTallyOptions {
  fixturesDirs: readonly string[];
  host?: string;
  /** 0 = pick a free port. */
  port?: number;
  /** Override every response's encoding (to test UTF-16 handling). */
  forceEncoding?: "utf-8" | "utf-16le";
  /** Artificial delay per request in ms (to test timeouts and serialisation). */
  latencyMs?: number;
}

export interface RequestLogEntry {
  method: string;
  key: RequestKey;
  fixture: string | null;
  body: string;
  at: string;
}

export interface MockTally {
  url: string;
  port: number;
  /** Every request received, in order. */
  requests: RequestLogEntry[];
  /** Highest number of requests handled at the same time (should stay 1 for our client). */
  readonly maxConcurrent: number;
  close(): Promise<void>;
}

export const DEFAULT_BANNER = "<RESPONSE>TallyPrime Server is Running</RESPONSE>";

function encode(text: string, encoding: "utf-8" | "utf-16le", bom: boolean): Buffer {
  if (encoding === "utf-8") return Buffer.from(text, "utf8");
  const body = Buffer.from(text, "utf16le");
  return bom ? Buffer.concat([Buffer.from([0xff, 0xfe]), body]) : body;
}

function errorEnvelope(message: string): string {
  return `<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>0</STATUS></HEADER><BODY><DATA>${escapeXml(message)}</DATA></BODY></ENVELOPE>`;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function startMockTally(options: MockTallyOptions): Promise<MockTally> {
  const fixtures: Fixture[] = loadFixtures(options.fixturesDirs);
  const requests: RequestLogEntry[] = [];
  let inFlight = 0;
  let maxConcurrent = 0;

  const send = (
    res: ServerResponse,
    status: number,
    text: string,
    encoding: "utf-8" | "utf-16le",
    bom = true,
    fixture: string | null = null,
  ): void => {
    const enc = options.forceEncoding ?? encoding;
    const charset = enc === "utf-16le" ? "utf-16" : "utf-8";
    res.writeHead(status, {
      "Content-Type": `text/xml; charset=${charset}`,
      "X-Mock-Tally-Fixture": fixture ?? "unmatched",
    });
    res.end(encode(text, enc, bom));
  };

  const server: Server = createServer((req, res) => {
    inFlight++;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    void (async () => {
      try {
        const raw = await readBody(req);
        if (options.latencyMs) await new Promise((r) => setTimeout(r, options.latencyMs));
        const body = raw.length
          ? decodeTallyResponse(new Uint8Array(raw), req.headers["content-type"]).text
          : "";
        const at = new Date().toISOString();

        if (req.method === "GET") {
          const banner = fixtures.find((f) => f.meta.method === "GET");
          requests.push({ method: "GET", key: {}, fixture: banner?.meta.name ?? null, body: "", at });
          send(
            res,
            200,
            banner?.response ?? DEFAULT_BANNER,
            banner?.meta.encoding ?? "utf-8",
            true,
            banner?.meta.name ?? "default-banner",
          );
          return;
        }

        const key = extractRequestKey(body);
        if (key.tallyRequest && key.tallyRequest.toLowerCase() !== "export") {
          // Phase 0: the mock does not simulate imports at all.
          requests.push({ method: "POST", key, fixture: null, body, at });
          send(res, 200, "<RESPONSE>Mock Tally: import requests are not supported</RESPONSE>", "utf-8");
          return;
        }
        const fixture = matchFixture(fixtures, key);
        requests.push({ method: "POST", key, fixture: fixture?.meta.name ?? null, body, at });
        if (!fixture) {
          send(res, 200, errorEnvelope(`Mock Tally: no fixture for ${JSON.stringify(key)}`), "utf-8");
          return;
        }
        send(
          res,
          fixture.meta.httpStatus,
          fixture.response,
          fixture.meta.encoding,
          fixture.meta.bom,
          fixture.meta.name,
        );
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(`Mock Tally internal error: ${String(err)}`);
      } finally {
        inFlight--;
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  const host = options.host ?? "127.0.0.1";

  return {
    url: `http://${host}:${port}`,
    port,
    requests,
    get maxConcurrent() {
      return maxConcurrent;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
