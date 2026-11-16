import type { TallyConnectionConfig } from "./config";
import { SerialQueue } from "./queue";
import { decodeTallyResponse, encodeTallyRequest, type TallyEncoding } from "./xml/encoding";
import { TallyError, TallyHttpError, TallyTimeoutError, TallyUnreachableError } from "./errors";

/**
 * Raw HTTP transport to Tally's XML port.
 *
 * ⚠️  This class will send ANY XML, including imports. It is exported only via the
 * `@tally-bridge/tally-client/transport` subpath, which apps/mcp-server is forbidden to
 * import (eslint no-restricted-imports + an architecture test). Read-only code must use
 * TallyReadClient instead.
 */
export interface TransportResponse {
  text: string;
  encoding: TallyEncoding;
  httpStatus: number;
  durationMs: number;
}

export interface PostOptions {
  /**
   * Retries on connection failure/timeout. Callers MUST pass 0 for imports: a timed-out
   * import may still have been applied by Tally, so the poster has to re-check for the
   * voucher (idempotency rule) instead of blindly re-sending.
   */
  retries: number;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class TallyTransport {
  readonly url: string;
  private readonly queue = new SerialQueue();

  constructor(
    private readonly config: TallyConnectionConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    this.url = `http://${config.host}:${config.port}`;
  }

  /** Number of requests waiting or in flight. */
  get queueSize(): number {
    return this.queue.size;
  }

  post(xml: string, options: PostOptions): Promise<TransportResponse> {
    return this.queue.run(() => this.withRetries(() => this.postOnce(xml), options.retries));
  }

  /** Plain GET on the port; Tally answers with a banner like "TallyPrime Server is Running". */
  getBanner(): Promise<TransportResponse> {
    return this.queue.run(() => this.withRetries(() => this.request("GET"), 0));
  }

  private postOnce(xml: string): Promise<TransportResponse> {
    return this.request("POST", xml);
  }

  private async request(method: "GET" | "POST", xml?: string): Promise<TransportResponse> {
    const started = Date.now();
    const init: RequestInit = {
      method,
      signal: AbortSignal.timeout(this.config.timeoutMs),
    };
    if (method === "POST" && xml !== undefined) {
      const charset = this.config.requestEncoding === "utf-16le" ? "utf-16" : "utf-8";
      init.headers = { "Content-Type": `text/xml; charset=${charset}` };
      init.body = encodeTallyRequest(xml, this.config.requestEncoding);
    }
    let res: Response;
    let bytes: Uint8Array;
    try {
      res = await this.fetchImpl(this.url, init);
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      throw this.classify(err);
    }
    const decoded = decodeTallyResponse(bytes, res.headers.get("content-type"));
    if (!res.ok) throw new TallyHttpError(res.status, decoded.text);
    return {
      text: decoded.text,
      encoding: decoded.encoding,
      httpStatus: res.status,
      durationMs: Date.now() - started,
    };
  }

  private classify(err: unknown): TallyError {
    if (err instanceof TallyError) return err;
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return new TallyTimeoutError(this.url, this.config.timeoutMs);
    }
    return new TallyUnreachableError(this.url, err);
  }

  private async withRetries<T>(fn: () => Promise<T>, retries: number): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (err) {
        const retriable = err instanceof TallyUnreachableError || err instanceof TallyTimeoutError;
        if (!retriable || attempt >= retries) throw err;
        attempt++;
        await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
      }
    }
  }
}
