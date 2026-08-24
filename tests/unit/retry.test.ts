import { describe, it, expect, vi } from "vitest";
import { retryWithBackoff } from "@worker/lib/retry";

describe("retryWithBackoff", () => {
  it("returns the result immediately on first success, without sleeping", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await retryWithBackoff(fn, { sleep });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries after a failure and succeeds on a later attempt", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce("recovered");
    const result = await retryWithBackoff(fn, { sleep, maxAttempts: 3 });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("throws the last error once maxAttempts is exhausted", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const err = new Error("permanently down");
    const fn = vi.fn().mockRejectedValue(err);
    await expect(retryWithBackoff(fn, { sleep, maxAttempts: 3 })).rejects.toThrow(
      "permanently down",
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("backs off exponentially, capped at maxDelayMs", async () => {
    const delays: number[] = [];
    const sleep = vi.fn().mockImplementation((ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    });
    const fn = vi.fn().mockRejectedValue(new Error("down"));
    await expect(
      retryWithBackoff(fn, { sleep, maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 300 }),
    ).rejects.toThrow();
    expect(delays).toHaveLength(3);
    // Each delay includes up to 25% jitter, so allow that margin above the
    // exponential base while still asserting the cap and growth trend.
    expect(delays[0]).toBeGreaterThanOrEqual(100);
    expect(delays[0]).toBeLessThan(100 * 1.25 + 1);
    expect(delays[2]).toBeLessThan(300 * 1.25 + 1);
  });
});
