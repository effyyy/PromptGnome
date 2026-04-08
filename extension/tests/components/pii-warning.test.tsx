import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import PIIWarning from "../../src/components/PIIWarning";
import type { PIIMatch } from "../../src/detection/types";

function makeMatch(overrides: Partial<PIIMatch> = {}): PIIMatch {
  // "My email is test@example.com" — 't' starts at index 12, 'm' ends at 28
  return {
    type: "EMAIL",
    value: "test@example.com",
    start: 12,
    end: 28,
    confidence: 0.95,
    source: "regex",
    ...overrides,
  };
}

describe("PIIWarning", () => {
  it("renders the detected items summary", () => {
    render(
      <PIIWarning
        text="My email is test@example.com"
        matches={[makeMatch()]}
        onSendAnyway={() => {}}
        onEditMessage={() => {}}
        onAutoAnonymize={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByText("Sensitive information detected")).toBeDefined();
    // PII item row shows the type tag and value
    expect(screen.getByText("EMAIL")).toBeDefined();
    expect(screen.getByText("test@example.com")).toBeDefined();
  });

  it("calls onRecordFeedback when the user confirms a detection", async () => {
    const onRecordFeedback = vi.fn().mockResolvedValue(true);

    render(
      <PIIWarning
        text="My email is test@example.com"
        matches={[makeMatch()]}
        onSendAnyway={() => {}}
        onEditMessage={() => {}}
        onAutoAnonymize={() => {}}
        onRecordFeedback={onRecordFeedback}
        onDismiss={() => {}}
      />,
    );

    // Expand the collapsible feedback section first
    await act(async () => {
      screen.getByRole("button", { name: "Detection feedback" }).click();
    });

    await act(async () => {
      screen.getByRole("button", { name: "Correct" }).click();
    });

    expect(onRecordFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ type: "EMAIL" }),
      true,
    );
  });

  it("shows a validation error when the missed-pattern description is empty", async () => {
    render(
      <PIIWarning
        text="My email is test@example.com"
        matches={[makeMatch()]}
        onSendAnyway={() => {}}
        onEditMessage={() => {}}
        onAutoAnonymize={() => {}}
        onReportMissedPII={vi.fn().mockResolvedValue(true)}
        onDismiss={() => {}}
      />,
    );

    // Expand the collapsible feedback section first
    await act(async () => {
      screen.getByRole("button", { name: "Detection feedback" }).click();
    });

    await act(async () => {
      screen.getByRole("button", { name: "Report missed PII" }).click();
    });

    await act(async () => {
      screen.getByRole("button", { name: "Save Report" }).click();
    });

    expect(
      screen.getByText("Add a short privacy-safe description before saving."),
    ).toBeDefined();
  });

  it("submits a privacy-safe missed-pattern report", async () => {
    const onReportMissedPII = vi.fn().mockResolvedValue(true);

    render(
      <PIIWarning
        text="My email is test@example.com"
        matches={[makeMatch()]}
        onSendAnyway={() => {}}
        onEditMessage={() => {}}
        onAutoAnonymize={() => {}}
        onReportMissedPII={onReportMissedPII}
        onDismiss={() => {}}
      />,
    );

    // Expand the collapsible feedback section first
    await act(async () => {
      screen.getByRole("button", { name: "Detection feedback" }).click();
    });

    await act(async () => {
      screen.getByRole("button", { name: "Report missed PII" }).click();
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Describe the missed format"), {
        target: { value: "phone number in XXX.XXX.XXXX format" },
      });
    });

    await act(async () => {
      screen.getByRole("button", { name: "Save Report" }).click();
    });

    expect(onReportMissedPII).toHaveBeenCalledWith({
      entityType: "EMAIL",
      description: "phone number in XXX.XXX.XXXX format",
    });
    expect(screen.getByText("Missed-pattern report saved locally.")).toBeDefined();
  });
});
