import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";
import LeadApprovalTable from "../LeadApprovalTable";

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ href, children, className }) => <a href={href} className={className}>{children}</a>
}));

const mockLeads = [
  {
    id: "lead-1",
    firstName: "Alice",
    lastName: "Smith",
    title: "CTO",
    company: "Acme AI",
    fitScore: 85,
    fitReasoning: ["Senior title", "AI startup", "India market", "No gaps"]
  },
  {
    id: "lead-2",
    firstName: "Bob",
    lastName: "Jones",
    title: "IT Manager",
    company: "Corp",
    fitScore: 38,
    fitReasoning: []
  },
  {
    id: "lead-3",
    firstName: "Carol",
    lastName: "Lee",
    title: "VP Eng",
    company: "Beta",
    fitScore: null,
    fitReasoning: null
  }
];

describe("LeadApprovalTable", () => {
  test("renders all leads", () => {
    render(
      <LeadApprovalTable
        leads={mockLeads}
        skippedIds={new Set()}
        onSkip={vi.fn()}
        onUndoSkip={vi.fn()}
        rowError={{}}
      />
    );
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(screen.getByText("Carol Lee")).toBeInTheDocument();
  });

  test("ScoreBadge shows correct colors", () => {
    render(
      <LeadApprovalTable
        leads={mockLeads}
        skippedIds={new Set()}
        onSkip={vi.fn()}
        onUndoSkip={vi.fn()}
        rowError={{}}
      />
    );
    const greenBadge = screen.getByText("85");
    expect(greenBadge.className).toContain("bg-green-100");

    const redBadge = screen.getByText("38");
    expect(redBadge.className).toContain("bg-red-100");

    expect(screen.getByText("No score")).toBeInTheDocument();
  });

  test("ReasoningCell toggles bullet list", () => {
    render(
      <LeadApprovalTable
        leads={mockLeads}
        skippedIds={new Set()}
        onSkip={vi.fn()}
        onUndoSkip={vi.fn()}
        rowError={{}}
      />
    );
    expect(screen.queryByText("Senior title")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("▼ Show"));
    expect(screen.getByText("Senior title")).toBeInTheDocument();
    fireEvent.click(screen.getByText("▲ Hide"));
    expect(screen.queryByText("Senior title")).not.toBeInTheDocument();
  });

  test("Skip button calls onSkip with lead id", () => {
    const onSkip = vi.fn();
    render(
      <LeadApprovalTable
        leads={[mockLeads[0]]}
        skippedIds={new Set()}
        onSkip={onSkip}
        onUndoSkip={vi.fn()}
        rowError={{}}
      />
    );
    fireEvent.click(screen.getByLabelText("Skip Alice Smith"));
    expect(onSkip).toHaveBeenCalledWith("lead-1");
  });

  test("Undo button calls onUndoSkip with lead id", () => {
    const onUndoSkip = vi.fn();
    render(
      <LeadApprovalTable
        leads={[mockLeads[0]]}
        skippedIds={new Set(["lead-1"])}
        onSkip={vi.fn()}
        onUndoSkip={onUndoSkip}
        rowError={{}}
      />
    );
    fireEvent.click(screen.getByLabelText("Undo skip for Alice Smith"));
    expect(onUndoSkip).toHaveBeenCalledWith("lead-1");
  });

  test("skipped lead row has opacity-40", () => {
    const { container } = render(
      <LeadApprovalTable
        leads={[mockLeads[0]]}
        skippedIds={new Set(["lead-1"])}
        onSkip={vi.fn()}
        onUndoSkip={vi.fn()}
        rowError={{}}
      />
    );
    const row = container.querySelector("tr[class*='opacity-40']");
    expect(row).not.toBeNull();
  });

  test("rowError displays inline error for a lead", () => {
    render(
      <LeadApprovalTable
        leads={[mockLeads[0]]}
        skippedIds={new Set()}
        onSkip={vi.fn()}
        onUndoSkip={vi.fn()}
        rowError={{ "lead-1": "Network error" }}
      />
    );
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });
});
