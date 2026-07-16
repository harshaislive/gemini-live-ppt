import { describe, expect, it } from "vitest";
import { parseInviteCreatorConfig } from "./invite-creator-config";

describe("parseInviteCreatorConfig", () => {
  it("uses the sales defaults", () => {
    expect(parseInviteCreatorConfig({})).toEqual({
      maxUses: 5,
      expiryDays: 14,
      campaign: "sales",
    });
  });

  it("reads bounded settings from the creator URL", () => {
    expect(parseInviteCreatorConfig({ uses: "9", expires: "30d", campaign: "Blyton July" })).toEqual({
      maxUses: 9,
      expiryDays: 30,
      campaign: "Blyton July",
    });
    expect(parseInviteCreatorConfig({ uses: "999", expires: "0d" })).toMatchObject({
      maxUses: 50,
      expiryDays: 1,
    });
  });
});
