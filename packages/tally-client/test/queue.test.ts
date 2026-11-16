import { describe, expect, it } from "vitest";
import { SerialQueue } from "../src";

describe("SerialQueue", () => {
  it("runs tasks one at a time in order, even when some fail", async () => {
    const q = new SerialQueue();
    const log: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const task =
      (name: string, ms: number, fail = false) =>
      async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        log.push(`start ${name}`);
        await new Promise((r) => setTimeout(r, ms));
        log.push(`end ${name}`);
        running--;
        if (fail) throw new Error(name);
        return name;
      };
    const results = await Promise.allSettled([
      q.run(task("a", 20)),
      q.run(task("b", 5, true)),
      q.run(task("c", 1)),
    ]);
    expect(maxRunning).toBe(1);
    expect(log).toEqual(["start a", "end a", "start b", "end b", "start c", "end c"]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
    expect(q.size).toBe(0);
  });
});
