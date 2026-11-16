import { z } from "zod";

export const TallyConnectionConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  timeoutMs: z.number().int().min(500).max(600_000),
  /** Retries for READ requests only. Writes are never retried by the transport. */
  readRetries: z.number().int().min(0).max(5),
  requestEncoding: z.enum(["utf-8", "utf-16le"]),
});
export type TallyConnectionConfig = z.infer<typeof TallyConnectionConfigSchema>;

export const DEFAULT_CONNECTION: TallyConnectionConfig = {
  host: "127.0.0.1",
  port: 9000,
  timeoutMs: 15_000,
  readRetries: 2,
  requestEncoding: "utf-8",
};

function intFromEnv(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`${name} must be an integer, got "${value}"`);
  return n;
}

/** Build a connection config from environment variables (see .env.example). */
export function connectionConfigFromEnv(env: NodeJS.ProcessEnv = process.env): TallyConnectionConfig {
  return TallyConnectionConfigSchema.parse({
    host: env.TALLY_HOST?.trim() || DEFAULT_CONNECTION.host,
    port: intFromEnv(env.TALLY_PORT, "TALLY_PORT") ?? DEFAULT_CONNECTION.port,
    timeoutMs: intFromEnv(env.TALLY_TIMEOUT_MS, "TALLY_TIMEOUT_MS") ?? DEFAULT_CONNECTION.timeoutMs,
    readRetries: intFromEnv(env.TALLY_READ_RETRIES, "TALLY_READ_RETRIES") ?? DEFAULT_CONNECTION.readRetries,
    requestEncoding: env.TALLY_REQUEST_ENCODING?.trim() || DEFAULT_CONNECTION.requestEncoding,
  });
}
