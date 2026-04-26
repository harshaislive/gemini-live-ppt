import { appendFile, mkdir } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/server-env", () => ({
  getServerEnv: vi.fn(() => ""),
}));

vi.mock("node:fs/promises", () => ({
  appendFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}));

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/subscribe-lead", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("subscribe lead route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects invalid lead details", async () => {
    const response = await POST(request({ name: "A", email: "bad", phone: "" }));

    expect(response.status).toBe(400);
    expect(appendFile).not.toHaveBeenCalled();
  });

  it("persists valid leads as jsonl when no webhook is configured", async () => {
    const response = await POST(request({
      name: "Harsha",
      email: "HARSH@example.com",
      phone: "+91 9999999999",
      interest: "Coorg",
      timing: "This quarter",
      firstUpdate: "Blyton",
    }));

    expect(response.status).toBe(200);
    expect(mkdir).toHaveBeenCalled();
    expect(appendFile).toHaveBeenCalledWith(
      expect.stringContaining("beforest-updates.jsonl"),
      expect.stringContaining("\"email\":\"harsh@example.com\""),
      "utf8",
    );
  });
});
