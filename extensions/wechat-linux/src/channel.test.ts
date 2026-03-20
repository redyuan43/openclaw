import { beforeEach, describe, expect, it, vi } from "vitest";

const bridgeMocks = vi.hoisted(() => ({
  resolveWechatLinuxBridgeTarget: vi.fn(),
}));

const accountMocks = vi.hoisted(() => ({
  listWechatLinuxAccountIds: vi.fn(),
  resolveDefaultWechatLinuxAccountId: vi.fn(),
  resolveWechatLinuxAccount: vi.fn(),
}));

vi.mock("./accounts.js", () => ({
  listWechatLinuxAccountIds: accountMocks.listWechatLinuxAccountIds,
  resolveDefaultWechatLinuxAccountId: accountMocks.resolveDefaultWechatLinuxAccountId,
  resolveWechatLinuxAccount: accountMocks.resolveWechatLinuxAccount,
}));

vi.mock("./bridge.js", () => ({
  parseWechatLinuxBridgeEnvelope: vi.fn(),
  resolveWechatLinuxBridgeTarget: bridgeMocks.resolveWechatLinuxBridgeTarget,
  spawnWechatLinuxBridgeWatch: vi.fn(),
}));

vi.mock("./probe.js", () => ({
  probeWechatLinux: vi.fn(),
}));

vi.mock("./runtime.js", () => ({
  getWechatLinuxRuntime: vi.fn(() => ({
    channel: {
      text: {
        chunkMarkdownText: vi.fn((text: string) => [text]),
      },
    },
  })),
}));

vi.mock("./send.js", () => ({
  sendWechatLinuxMedia: vi.fn(),
  sendWechatLinuxText: vi.fn(),
  emptyWechatLinuxResult: {},
  resolveWechatLinuxTextChunkLimit: vi.fn(() => 3500),
}));

vi.mock("./setup-core.js", () => ({
  wechatLinuxSetupAdapter: {},
}));

vi.mock("./setup-surface.js", () => ({
  wechatLinuxSetupWizard: {},
}));

import { resolveWechatLinuxBridgeTarget } from "./bridge.js";
import { wechatLinuxPlugin } from "./channel.js";

describe("wechat-linux channel target resolution", () => {
  const resolveTarget = wechatLinuxPlugin.messaging?.targetResolver?.resolveTarget;

  beforeEach(() => {
    accountMocks.listWechatLinuxAccountIds.mockReset();
    accountMocks.resolveDefaultWechatLinuxAccountId.mockReset();
    accountMocks.resolveWechatLinuxAccount.mockReset();
    bridgeMocks.resolveWechatLinuxBridgeTarget.mockReset();

    accountMocks.listWechatLinuxAccountIds.mockReturnValue(["default"]);
    accountMocks.resolveDefaultWechatLinuxAccountId.mockReturnValue("default");
    accountMocks.resolveWechatLinuxAccount.mockReturnValue({
      accountId: "default",
      enabled: true,
      configured: true,
      pyWxDumpRoot: "/tmp/pywxdump",
      pythonPath: "python3",
      keyFile: "~/.wx_db_keys.json",
      outputDir: "/tmp/wx_decrypted",
      windowClass: "wechat",
      windowMode: "auto",
      config: {},
    });
  });

  it("resolves display names through the bridge instead of coercing them into direct ids", async () => {
    expect(resolveTarget).toBeTypeOf("function");
    if (!resolveTarget) {
      throw new Error("wechat-linux targetResolver is unavailable");
    }
    vi.mocked(resolveWechatLinuxBridgeTarget).mockResolvedValue({
      ok: true,
      input: "Project Room",
      chat_id: "room123@chatroom",
      chat_name: "Project Room",
      chat_type: "group",
    });

    const resolved = await resolveTarget({
      cfg: {} as never,
      accountId: "default",
      input: "Project Room",
      normalized: "wechat-linux:Project Room",
      preferredKind: "group",
    });

    expect(resolveWechatLinuxBridgeTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "Project Room",
        kind: "group",
      }),
    );
    expect(resolved).toEqual({
      to: "wechat-linux:group:room123@chatroom",
      kind: "group",
      display: "Project Room",
      source: "directory",
    });
  });

  it("keeps stable WeChat ids on the direct fast path", async () => {
    expect(resolveTarget).toBeTypeOf("function");
    if (!resolveTarget) {
      throw new Error("wechat-linux targetResolver is unavailable");
    }

    const resolved = await resolveTarget({
      cfg: {} as never,
      accountId: "default",
      input: "wxid_alice",
      normalized: "wechat-linux:user:wxid_alice",
      preferredKind: "user",
    });

    expect(resolveWechatLinuxBridgeTarget).not.toHaveBeenCalled();
    expect(resolved).toEqual({
      to: "wechat-linux:user:wxid_alice",
      kind: "user",
      source: "normalized",
    });
  });
});

describe("wechat-linux default account deletion", () => {
  it("clears account-scoped policy and limit fields from the default account root", () => {
    const updated = wechatLinuxPlugin.config.deleteAccount!({
      cfg: {
        channels: {
          "wechat-linux": {
            name: "WeChat",
            pyWxDumpRoot: "/tmp/pywxdump",
            dmPolicy: "open",
            allowFrom: ["wxid_alice"],
            groupPolicy: "open",
            groupAllowFrom: ["room123@chatroom"],
            mentionPatterns: ["bot"],
            textChunkLimit: 1024,
            blockStreaming: false,
            mediaMaxMb: 128,
            markdown: { tables: false },
            accounts: {
              alt: {
                pyWxDumpRoot: "/tmp/alt",
              },
            },
          },
        },
      } as never,
      accountId: "default",
    });

    expect(updated.channels?.["wechat-linux"]).toEqual({
      markdown: { tables: false },
      accounts: {
        alt: {
          pyWxDumpRoot: "/tmp/alt",
        },
      },
    });
  });
});
