/**
 * Tests for the PIIOverlay content-script CSUI component.
 *
 * The overlay listens for pii-shield:outbound window messages, sends a
 * SCAN_REQUEST to chrome.runtime, and either proceeds silently or renders
 * PIIWarning for the user to decide.
 *
 * Architecture layer: Tests (content scripts / UI)
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Chrome runtime mock — must be installed before any module import
// ---------------------------------------------------------------------------

const mockSendMessage = vi.fn();
const mockStorageGet = vi.fn(
  (_key: string, callback: (items: Record<string, unknown>) => void) => {
    callback({
      settings: {
        protectionEnabled: true,
        highlightingEnabled: true,
        enabledProviders: { CHATGPT: true },
      },
    });
  },
);
const mockStorageAddListener = vi.fn();
const mockStorageRemoveListener = vi.fn();

vi.stubGlobal("chrome", {
  runtime: {
    id: "test-extension-id",
    sendMessage: mockSendMessage,
    lastError: null as chrome.runtime.LastError | null,
  },
  storage: {
    local: {
      get: mockStorageGet,
    },
    onChanged: {
      addListener: mockStorageAddListener,
      removeListener: mockStorageRemoveListener,
    },
  },
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("~src/content-style.css", () => ({}));

vi.mock("~src/components/PIIWarning", () => ({
  default: (props: {
    text: string;
    matches: PIIMatch[];
    onSendAnyway: () => void;
    onEditMessage: () => void;
    onAutoAnonymize: () => void;
    onRecordFeedback?: (match: PIIMatch, correct: boolean) => Promise<boolean>;
    onReportMissedPII?: (report: {
      entityType: string;
      description: string;
    }) => Promise<boolean>;
    onDismiss: () => void;
  }) => (
    <div data-testid="pii-warning">
      <span data-testid="pii-warning-text">{props.text}</span>
      <button data-testid="btn-send-anyway" onClick={props.onSendAnyway}>
        Send Anyway
      </button>
      <button data-testid="btn-edit-message" onClick={props.onEditMessage}>
        Edit Message
      </button>
      <button data-testid="btn-auto-anonymize" onClick={props.onAutoAnonymize}>
        Auto-Anonymize
      </button>
      <button
        data-testid="btn-feedback-correct"
        onClick={() => props.onRecordFeedback?.(props.matches[0], true)}>
        Feedback Correct
      </button>
      <button
        data-testid="btn-report-missed"
        onClick={() =>
          props.onReportMissedPII?.({
            entityType: "PHONE_US",
            description: "phone number in XXX.XXX.XXXX format"
          })
        }>
        Report Missed
      </button>
      <button data-testid="btn-dismiss" onClick={props.onDismiss}>
        Dismiss
      </button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------

import PIIOverlay, { __resetModuleStateForTesting } from "~src/contents/overlay";
import type { PIIMatch } from "~src/detection/types";

// ---------------------------------------------------------------------------
// Module-level state reset — prevents test contamination via module-level
// requestQueue and isPermanentlyUnmounted variables in overlay.tsx
// ---------------------------------------------------------------------------

beforeEach(() => {
  __resetModuleStateForTesting()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMatch(overrides: Partial<PIIMatch> = {}): PIIMatch {
  return {
    type: "EMAIL",
    value: "test@example.com",
    start: 0,
    end: 16,
    confidence: 0.95,
    source: "regex",
    ...overrides,
  };
}

/**
 * Dispatch a pii-shield:outbound window message, mimicking the interceptor.
 */
function dispatchOutbound(detail: {
  messageText: string;
  provider: string;
  requestId: string;
  originalBody?: string;
}) {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: { __piiShield: true, channel: "pii-shield:outbound", ...detail },
      origin: window.location.origin,
    })
  );
}

/**
 * Dispatch a pii-shield:restore-draft message, mimicking the interceptor.
 */
function dispatchRestoreDraft(provider: string) {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        __piiShield: true,
        channel: "pii-shield:restore-draft",
        provider,
      },
      origin: window.location.origin,
    })
  );
}

/**
 * Dispatch a pii-shield:response-complete message, mimicking the interceptor.
 */
function dispatchResponseComplete(provider: string) {
  window.dispatchEvent(
    new MessageEvent("message", {
      data: {
        __piiShield: true,
        channel: "pii-shield:response-complete",
        provider,
        responseText: "placeholder response",
      },
      origin: window.location.origin,
    })
  );
}

/**
 * Build a successful SCAN_REQUEST response with no matches.
 */
function makeScanResultNoMatches() {
  return { success: true, data: { matches: [], behaviorMode: "warn" } };
}

/**
 * Build a successful SCAN_REQUEST response with matches and a given mode.
 */
function makeScanResultWithMatches(
  matches: PIIMatch[],
  behaviorMode: "warn" | "silent" | "block" = "warn"
) {
  return { success: true, data: { matches, behaviorMode } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PIIOverlay — initial render", () => {
  it("should render nothing when there is no pending interception", () => {
    const { container } = render(<PIIOverlay />);
    expect(container.firstChild).toBeNull();
  });
});

describe("PIIOverlay — no PII found", () => {
  let postMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    postMessageSpy = vi.spyOn(window, "postMessage") as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    postMessageSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("should post a proceed response immediately when no PII is detected", async () => {
    mockSendMessage.mockResolvedValueOnce(makeScanResultNoMatches());

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "Hello, how are you?",
        provider: "CHATGPT",
        requestId: "req-001",
      });
    });

    const respondCalls = postMessageSpy.mock.calls.filter(
      (args) => (args[0] as Record<string, unknown>)?.__piiShield === true && (args[0] as Record<string, unknown>)?.channel === "pii-shield:response"
    );
    expect(respondCalls).toHaveLength(1);
    const response = respondCalls[0][0] as Record<string, unknown>;
    expect(response.action).toBe("proceed");
    expect(response.requestId).toBe("req-001");
  });

  it("should not show the PIIWarning when no PII is detected", async () => {
    mockSendMessage.mockResolvedValueOnce(makeScanResultNoMatches());

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "Safe message",
        provider: "CLAUDE",
        requestId: "req-002",
      });
    });

    expect(screen.queryByTestId("pii-warning")).toBeNull();
  });
});

describe("PIIOverlay — warn mode", () => {
  let postMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    postMessageSpy = vi.spyOn(window, "postMessage") as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    postMessageSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("should show PIIWarning when PII is detected in warn mode", async () => {
    mockSendMessage.mockResolvedValueOnce(
      makeScanResultWithMatches([makeMatch()], "warn")
    );

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "My email is test@example.com",
        provider: "CHATGPT",
        requestId: "req-010",
      });
    });

    expect(screen.getByTestId("pii-warning")).toBeDefined();
  });

  it("should pass the original message text to PIIWarning", async () => {
    mockSendMessage.mockResolvedValueOnce(
      makeScanResultWithMatches([makeMatch()], "warn")
    );

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "My email is test@example.com",
        provider: "CHATGPT",
        requestId: "req-011",
      });
    });

    expect(screen.getByTestId("pii-warning-text").textContent).toBe(
      "My email is test@example.com"
    );
  });

  it("should hide PIIWarning and post proceed when user clicks Send Anyway", async () => {
    mockSendMessage.mockResolvedValue(
      makeScanResultWithMatches([makeMatch()], "warn")
    );

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "test@example.com",
        provider: "CHATGPT",
        requestId: "req-020",
      });
    });

    await act(async () => {
      screen.getByTestId("btn-send-anyway").click();
    });

    expect(screen.queryByTestId("pii-warning")).toBeNull();
    const respondCalls = postMessageSpy.mock.calls.filter(
      (args) => (args[0] as Record<string, unknown>)?.__piiShield === true && (args[0] as Record<string, unknown>)?.channel === "pii-shield:response"
    );
    expect(respondCalls).toHaveLength(1);
    expect((respondCalls[0][0] as Record<string, unknown>).action).toBe("proceed");
  });

  it("should post a STATS_UPDATE with messagesSentAnyway=1 on Send Anyway", async () => {
    mockSendMessage.mockResolvedValue(
      makeScanResultWithMatches([makeMatch()], "warn")
    );

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "test@example.com",
        provider: "CHATGPT",
        requestId: "req-021",
      });
    });

    await act(async () => {
      screen.getByTestId("btn-send-anyway").click();
    });

    const statsCalls = mockSendMessage.mock.calls.filter(
      (args) => args[0]?.type === "STATS_UPDATE" && args[0]?.messagesSentAnyway === 1
    );
    expect(statsCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("should post block response and hide PIIWarning when user clicks Edit Message", async () => {
    mockSendMessage.mockResolvedValue(
      makeScanResultWithMatches([makeMatch()], "warn")
    );

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "test@example.com",
        provider: "CHATGPT",
        requestId: "req-030",
      });
    });

    await act(async () => {
      screen.getByTestId("btn-edit-message").click();
    });

    expect(screen.queryByTestId("pii-warning")).toBeNull();
    const respondCalls = postMessageSpy.mock.calls.filter(
      (args) => (args[0] as Record<string, unknown>)?.__piiShield === true && (args[0] as Record<string, unknown>)?.channel === "pii-shield:response"
    );
    expect(respondCalls).toHaveLength(1);
    expect((respondCalls[0][0] as Record<string, unknown>).action).toBe("block");
  });

  it("should post STATS_UPDATE with messagesBlocked=1 when user edits", async () => {
    mockSendMessage.mockResolvedValue(
      makeScanResultWithMatches([makeMatch()], "warn")
    );

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "test@example.com",
        provider: "CHATGPT",
        requestId: "req-031",
      });
    });

    await act(async () => {
      screen.getByTestId("btn-edit-message").click();
    });

    const statsCalls = mockSendMessage.mock.calls.filter(
      (args) => args[0]?.type === "STATS_UPDATE" && args[0]?.messagesBlocked === 1
    );
    expect(statsCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("should hide PIIWarning and send block when user clicks Dismiss", async () => {
    mockSendMessage.mockResolvedValue(
      makeScanResultWithMatches([makeMatch()], "warn")
    );

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "test@example.com",
        provider: "CHATGPT",
        requestId: "req-040",
      });
    });

    await act(async () => {
      screen.getByTestId("btn-dismiss").click();
    });

    expect(screen.queryByTestId("pii-warning")).toBeNull();
    const respondCalls = postMessageSpy.mock.calls.filter(
      (args) => (args[0] as Record<string, unknown>)?.__piiShield === true && (args[0] as Record<string, unknown>)?.channel === "pii-shield:response"
    );
    expect(respondCalls).toHaveLength(1);
    expect((respondCalls[0][0] as Record<string, unknown>).action).toBe("block");
  });

  it("should hide PIIWarning and send proceed on Auto-Anonymize (falls back when no adapter)", async () => {
    mockSendMessage.mockResolvedValue(
      makeScanResultWithMatches([makeMatch()], "warn")
    );

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "test@example.com",
        provider: "CHATGPT",
        requestId: "req-050",
        originalBody: '{"messages":[]}',
      });
    });

    await act(async () => {
      screen.getByTestId("btn-auto-anonymize").click();
    });

    // Wait for async handleAutoAnonymize to complete (dynamic imports + fail-open)
    await waitFor(() => {
      expect(screen.queryByTestId("pii-warning")).toBeNull();
    }, { timeout: 2000 });
    const respondCalls = postMessageSpy.mock.calls.filter(
      (args) => (args[0] as Record<string, unknown>)?.__piiShield === true && (args[0] as Record<string, unknown>)?.channel === "pii-shield:response"
    );
    expect(respondCalls).toHaveLength(1);
    // Falls back to "proceed" when adapter is unavailable in test environment
    expect((respondCalls[0][0] as Record<string, unknown>).action).toBe("proceed");
  });

  it("should not rehydrate original PII back into the provider DOM after auto-anonymize", async () => {
    mockSendMessage
      .mockResolvedValueOnce(makeScanResultWithMatches([makeMatch()], "warn"))
      .mockResolvedValueOnce({
        success: true,
        data: {
          modifiedBody: '{"messages":["[EMAIL_1]"]}',
          mapperSnapshot: {
            "[EMAIL_1]": "test@example.com",
            "__counter:EMAIL": "1",
          },
          sessionId: "tab:123",
          anonymizedText: "[EMAIL_1]",
        },
      });

    const main = document.createElement("main");
    main.innerHTML = '<div id="assistant-reply">Reply includes [EMAIL_1]</div>';
    document.body.appendChild(main);

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "test@example.com",
        provider: "CHATGPT",
        requestId: "req-051",
        originalBody: '{"messages":["test@example.com"]}',
      });
    });

    await act(async () => {
      screen.getByTestId("btn-auto-anonymize").click();
    });

    await waitFor(() => {
      expect(screen.queryByTestId("pii-warning")).toBeNull();
    });

    await act(async () => {
      dispatchResponseComplete("CHATGPT");
    });

    expect(main.textContent).toContain("[EMAIL_1]");
    expect(main.textContent).not.toContain("test@example.com");
    expect(main.querySelector("[data-pii-rehydrated='true']")).toBeNull();

    main.remove();
  });

  it("should send a LOG_USER_DECISION message with action=dismissed on Send Anyway", async () => {
    mockSendMessage.mockResolvedValue(
      makeScanResultWithMatches([makeMatch()], "warn")
    );

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "test@example.com",
        provider: "CHATGPT",
        requestId: "req-060",
      });
    });

    await act(async () => {
      screen.getByTestId("btn-send-anyway").click();
    });

    const logCalls = mockSendMessage.mock.calls.filter(
      (args) => args[0]?.type === "LOG_USER_DECISION" && args[0]?.action === "dismissed"
    );
    expect(logCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("should send a LOG_USER_DECISION message with action=blocked on Edit Message", async () => {
    mockSendMessage.mockResolvedValue(
      makeScanResultWithMatches([makeMatch()], "warn")
    );

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "test@example.com",
        provider: "CHATGPT",
        requestId: "req-061",
      });
    });

    await act(async () => {
      screen.getByTestId("btn-edit-message").click();
    });

    const logCalls = mockSendMessage.mock.calls.filter(
      (args) => args[0]?.type === "LOG_USER_DECISION" && args[0]?.action === "blocked"
    );
    expect(logCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("should record feedback when the user marks a detection as correct", async () => {
    mockSendMessage.mockResolvedValueOnce(
      makeScanResultWithMatches([makeMatch()], "warn")
    );
    mockSendMessage.mockResolvedValueOnce({ success: true });

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "test@example.com",
        provider: "CHATGPT",
        requestId: "req-062",
      });
    });

    await act(async () => {
      screen.getByTestId("btn-feedback-correct").click();
    });

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: "RECORD_FEEDBACK",
      entityType: "EMAIL",
      correct: true,
    });
  });

  it("should store a privacy-safe missed-PII report from the warning modal", async () => {
    mockSendMessage.mockResolvedValueOnce(
      makeScanResultWithMatches([makeMatch()], "warn")
    );
    mockSendMessage.mockResolvedValueOnce({ success: true });

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "test@example.com",
        provider: "CHATGPT",
        requestId: "req-063",
      });
    });

    await act(async () => {
      screen.getByTestId("btn-report-missed").click();
    });

    expect(mockSendMessage).toHaveBeenCalledWith({
      type: "REPORT_MISSED_PII",
      provider: "CHATGPT",
      entityType: "PHONE_US",
      description: "phone number in XXX.XXX.XXXX format",
    });
  });
});

describe("PIIOverlay — silent mode", () => {
  let postMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    postMessageSpy = vi.spyOn(window, "postMessage") as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    postMessageSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("should proceed silently without showing the overlay in silent mode", async () => {
    mockSendMessage.mockResolvedValueOnce(
      makeScanResultWithMatches([makeMatch()], "silent")
    );

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "test@example.com",
        provider: "CHATGPT",
        requestId: "req-100",
      });
    });

    expect(screen.queryByTestId("pii-warning")).toBeNull();

    const respondCalls = postMessageSpy.mock.calls.filter(
      (args) => (args[0] as Record<string, unknown>)?.__piiShield === true && (args[0] as Record<string, unknown>)?.channel === "pii-shield:response"
    );
    expect(respondCalls).toHaveLength(1);
    expect((respondCalls[0][0] as Record<string, unknown>).action).toBe("proceed");
  });
});

describe("PIIOverlay — block mode", () => {
  let postMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    postMessageSpy = vi.spyOn(window, "postMessage") as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    postMessageSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("should auto-block without showing the overlay in block mode", async () => {
    mockSendMessage.mockResolvedValue(
      makeScanResultWithMatches([makeMatch()], "block")
    );

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "test@example.com",
        provider: "CHATGPT",
        requestId: "req-200",
      });
    });

    expect(screen.queryByTestId("pii-warning")).toBeNull();

    const respondCalls = postMessageSpy.mock.calls.filter(
      (args) => (args[0] as Record<string, unknown>)?.__piiShield === true && (args[0] as Record<string, unknown>)?.channel === "pii-shield:response"
    );
    expect(respondCalls).toHaveLength(1);
    expect((respondCalls[0][0] as Record<string, unknown>).action).toBe("block");
  });

  it("should post STATS_UPDATE with messagesBlocked=1 in block mode", async () => {
    mockSendMessage.mockResolvedValue(
      makeScanResultWithMatches([makeMatch()], "block")
    );

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "test@example.com",
        provider: "CHATGPT",
        requestId: "req-201",
      });
    });

    const statsCalls = mockSendMessage.mock.calls.filter(
      (args) => args[0]?.type === "STATS_UPDATE" && args[0]?.messagesBlocked === 1
    );
    expect(statsCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("should post LOG_USER_DECISION with action=blocked in block mode", async () => {
    mockSendMessage.mockResolvedValue(
      makeScanResultWithMatches([makeMatch()], "block")
    );

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "test@example.com",
        provider: "CHATGPT",
        requestId: "req-202",
      });
    });

    const logCalls = mockSendMessage.mock.calls.filter(
      (args) => args[0]?.type === "LOG_USER_DECISION" && args[0]?.action === "blocked"
    );
    expect(logCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("PIIOverlay — restore-draft message handling", () => {
  it("should not crash when a pii-shield:restore-draft message is received", async () => {
    render(<PIIOverlay />);

    await act(async () => {
      dispatchRestoreDraft("CHATGPT");
    });

    // No error thrown — component still mounted
    expect(screen.queryByTestId("pii-warning")).toBeNull();
  });

  it("should not crash when restore-draft provider is unknown", async () => {
    render(<PIIOverlay />);

    await act(async () => {
      dispatchRestoreDraft("UNKNOWN_PROVIDER");
    });

    expect(screen.queryByTestId("pii-warning")).toBeNull();
  });
});

describe("PIIOverlay — scan request error handling", () => {
  let postMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    postMessageSpy = vi.spyOn(window, "postMessage") as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    postMessageSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("should fail-open (proceed) when chrome.runtime.sendMessage rejects", async () => {
    mockSendMessage.mockRejectedValueOnce(new Error("Service worker unavailable"));

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "test@example.com",
        provider: "CHATGPT",
        requestId: "req-300",
      });
    });

    const respondCalls = postMessageSpy.mock.calls.filter(
      (args) => (args[0] as Record<string, unknown>)?.__piiShield === true && (args[0] as Record<string, unknown>)?.channel === "pii-shield:response"
    );
    expect(respondCalls).toHaveLength(1);
    expect((respondCalls[0][0] as Record<string, unknown>).action).toBe("proceed");
  });

  it("should proceed when the scan result has success=false", async () => {
    mockSendMessage.mockResolvedValueOnce({ success: false, error: "Detection failed" });

    render(<PIIOverlay />);

    await act(async () => {
      dispatchOutbound({
        messageText: "some text",
        provider: "CLAUDE",
        requestId: "req-301",
      });
    });

    const respondCalls = postMessageSpy.mock.calls.filter(
      (args) => (args[0] as Record<string, unknown>)?.__piiShield === true && (args[0] as Record<string, unknown>)?.channel === "pii-shield:response"
    );
    expect(respondCalls).toHaveLength(1);
    expect((respondCalls[0][0] as Record<string, unknown>).action).toBe("proceed");
  });

  it("should ignore outbound messages missing messageText", async () => {
    mockSendMessage.mockResolvedValue(makeScanResultNoMatches());

    render(<PIIOverlay />);

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            __piiShield: true,
            channel: "pii-shield:outbound",
            provider: "CHATGPT",
            requestId: "req-missing-text",
            /* no messageText */
          },
          origin: window.location.origin,
        })
      );
    });

    const respondCalls = postMessageSpy.mock.calls.filter(
      (args) => (args[0] as Record<string, unknown>)?.__piiShield === true && (args[0] as Record<string, unknown>)?.channel === "pii-shield:response"
    );
    // No response should be sent when messageText is missing
    expect(respondCalls).toHaveLength(0);
  });

  it("should ignore outbound messages from another origin", async () => {
    mockSendMessage.mockResolvedValue(makeScanResultNoMatches());

    render(<PIIOverlay />);

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            __piiShield: true,
            channel: "pii-shield:outbound",
            messageText: "test@example.com",
            provider: "CHATGPT",
            requestId: "req-evil-origin",
          },
          origin: "https://evil.example",
          source: window,
        })
      );
    });

    expect(mockSendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "SCAN_REQUEST" }),
    );

    const respondCalls = postMessageSpy.mock.calls.filter(
      (args) => (args[0] as Record<string, unknown>)?.__piiShield === true && (args[0] as Record<string, unknown>)?.channel === "pii-shield:response"
    );
    expect(respondCalls).toHaveLength(0);
  });
});

describe("PIIOverlay — pre-mount request buffering", () => {
  it("should scan a message that arrived before React mounted (single request)", async () => {
    const postMessageSpy = vi.spyOn(window, "postMessage") as unknown as ReturnType<typeof vi.fn>
    mockSendMessage.mockResolvedValueOnce(makeScanResultNoMatches())

    // Dispatch BEFORE render — must be buffered
    window.dispatchEvent(
      new MessageEvent("message", {
        data: {
          __piiShield: true,
          channel: "pii-shield:outbound",
          messageText: "Hello world",
          provider: "CHATGPT",
          requestId: "req-pre-mount-001",
        },
        origin: window.location.origin,
      })
    )

    // Render — useEffect fires, flushes the buffer
    await act(async () => {
      render(<PIIOverlay />)
    })

    const scanCalls = mockSendMessage.mock.calls.filter(
      (args) => args[0]?.type === "SCAN_REQUEST"
    )
    expect(scanCalls.length).toBeGreaterThanOrEqual(1)

    const respondCalls = postMessageSpy.mock.calls.filter(
      (args) =>
        (args[0] as Record<string, unknown>)?.__piiShield === true &&
        (args[0] as Record<string, unknown>)?.channel === "pii-shield:response"
    )
    expect(respondCalls).toHaveLength(1)
    expect((respondCalls[0][0] as Record<string, unknown>).requestId).toBe(
      "req-pre-mount-001"
    )

    postMessageSpy.mockRestore()
  })

  it("should flush multiple buffered requests in FIFO order", async () => {
    const postMessageSpy = vi.spyOn(window, "postMessage") as unknown as ReturnType<typeof vi.fn>
    mockSendMessage.mockResolvedValue(makeScanResultNoMatches())

    // Dispatch two messages before render
    for (const id of ["req-fifo-001", "req-fifo-002"]) {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            __piiShield: true,
            channel: "pii-shield:outbound",
            messageText: "text",
            provider: "CHATGPT",
            requestId: id,
          },
          origin: window.location.origin,
        })
      )
    }

    await act(async () => {
      render(<PIIOverlay />)
    })

    const respondCalls = postMessageSpy.mock.calls
      .filter(
        (args) =>
          (args[0] as Record<string, unknown>)?.__piiShield === true &&
          (args[0] as Record<string, unknown>)?.channel === "pii-shield:response"
      )
      .map((args) => (args[0] as Record<string, unknown>).requestId as string)

    expect(respondCalls).toHaveLength(2)
    expect(respondCalls[0]).toBe("req-fifo-001")
    expect(respondCalls[1]).toBe("req-fifo-002")

    postMessageSpy.mockRestore()
  })
})

describe("PIIOverlay — event listener cleanup", () => {
  it("should proceed immediately (fail-safe) when a message arrives after the component unmounts", async () => {
    // The module-level window listener persists intentionally so the interceptor
    // is never left hanging. After unmount the active handler is cleared, so any
    // incoming outbound message should receive an immediate "proceed" response.
    const postMessageSpy = vi.spyOn(window, "postMessage") as unknown as ReturnType<typeof vi.fn>;

    const { unmount } = render(<PIIOverlay />);
    unmount();

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            __piiShield: true,
            channel: "pii-shield:outbound",
            messageText: "test@example.com",
            provider: "CHATGPT",
            requestId: "req-unmount-001",
          },
          origin: window.location.origin,
        })
      );
    });

    const respondCalls = postMessageSpy.mock.calls.filter(
      (args) => (args[0] as Record<string, unknown>)?.__piiShield === true &&
                (args[0] as Record<string, unknown>)?.channel === "pii-shield:response"
    );
    expect(respondCalls).toHaveLength(1);
    expect((respondCalls[0][0] as Record<string, unknown>).action).toBe("proceed");

    postMessageSpy.mockRestore();
  });
});

describe("PIIOverlay — settings sync bridge", () => {
  it("should respond to pii-shield:settings-request with pii-shield:settings-sync", async () => {
    const postMessageSpy = vi.spyOn(window, "postMessage") as unknown as ReturnType<typeof vi.fn>

    render(<PIIOverlay />)

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            __piiShield: true,
            channel: "pii-shield:settings-request",
          },
          origin: window.location.origin,
        }),
      )
    })

    const syncCalls = postMessageSpy.mock.calls.filter(
      (args) =>
        (args[0] as Record<string, unknown>)?.__piiShield === true &&
        (args[0] as Record<string, unknown>)?.channel === "pii-shield:settings-sync",
    )

    expect(syncCalls.length).toBeGreaterThanOrEqual(1)
    expect((syncCalls[0][0] as Record<string, unknown>).settings).toBeDefined()
    postMessageSpy.mockRestore()
  })
})
