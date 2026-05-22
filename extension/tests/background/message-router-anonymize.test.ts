import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PIIMatch } from "../../src/detection/types";
import { MESSAGE_TYPES } from "../../src/shared/messages";

const encryptedStoreInitSpy = vi.fn();
const encryptedStoreStoreSpy = vi.fn();

let registeredListener:
  | ((
      message: Record<string, unknown>,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void,
    ) => boolean)
  | null = null;

const chromeMock = {
  runtime: {
    lastError: null as chrome.runtime.LastError | null,
    onMessage: {
      addListener: vi.fn((listener: typeof registeredListener) => {
        registeredListener = listener;
      }),
    },
  },
  storage: {
    local: {
      get: vi.fn((_keys: unknown, cb?: (items: Record<string, unknown>) => void) => {
        const result: Record<string, unknown> = {};
        if (cb) {
          cb(result);
          return;
        }
        return Promise.resolve(result);
      }),
      set: vi.fn((_items: Record<string, unknown>, cb?: () => void) => {
        if (cb) {
          cb();
          return;
        }
        return Promise.resolve();
      }),
    },
    sync: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
    },
    session: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
    },
  },
  sidePanel: {
    open: vi.fn(async () => {}),
  },
  windows: {
    getLastFocused: vi.fn(async () => ({ id: 1 })),
  },
};

vi.stubGlobal("chrome", chromeMock);
vi.stubGlobal("performance", { now: () => Date.now() });

vi.mock("~src/providers/registry", () => ({
  getAdapterForHostname: vi.fn(() => ({
    name: "CHATGPT",
    replaceUserMessage: vi.fn((_body: string, newMessage: string) => `{"messages":["${newMessage}"]}`),
  })),
}));

vi.mock("~src/anonymization/anonymizer", () => ({
  anonymizeText: vi.fn(() => ({
    anonymizedText: "[EMAIL_1]",
  })),
}));

vi.mock("~src/anonymization/encrypted-store", () => ({
  EncryptedMappingStore: class {
    async init(): Promise<void> {
      encryptedStoreInitSpy();
    }

    async store(): Promise<void> {
      encryptedStoreStoreSpy();
    }
  },
}));

vi.mock("~src/utils/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    group: vi.fn(),
    groupEnd: vi.fn(),
  }),
}));

import { initMessageRouter } from "../../src/background/message-router";

function makeMatch(): PIIMatch {
  return {
    type: "EMAIL",
    value: "test@example.com",
    start: 0,
    end: 16,
    confidence: 0.95,
    source: "regex",
  };
}

async function sendRuntimeMessage(message: Record<string, unknown>): Promise<unknown> {
  if (!registeredListener) {
    throw new Error("Message listener not registered");
  }

  return new Promise((resolve) => {
    registeredListener!(
      message,
      {} as chrome.runtime.MessageSender,
      resolve,
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  registeredListener = null;
  initMessageRouter();
});

describe("message-router anonymize flow", () => {
  it("should not persist reversible mappings or return them to the overlay", async () => {
    const response = await sendRuntimeMessage({
      type: MESSAGE_TYPES.ANONYMIZE_REQUEST,
      text: "test@example.com",
      matches: [makeMatch()],
      provider: "CHATGPT",
      hostname: "chatgpt.com",
      originalBody: '{"messages":["test@example.com"]}',
    }) as {
      success: boolean;
      data?: Record<string, unknown>;
      error?: string;
    };

    expect(response.success).toBe(true);
    expect(response.data).toEqual({
      modifiedBody: '{"messages":["[EMAIL_1]"]}',
      anonymizedText: "[EMAIL_1]",
    });
    expect(encryptedStoreInitSpy).not.toHaveBeenCalled();
    expect(encryptedStoreStoreSpy).not.toHaveBeenCalled();
  });
});
