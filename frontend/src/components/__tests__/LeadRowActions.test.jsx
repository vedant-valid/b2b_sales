import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import LeadRowActions from "../LeadRowActions";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";

const mkLead = (status, overrides = {}) => ({ id: "lead-1", status, email: "lead@example.com", ...overrides });

afterEach(() => { vi.clearAllMocks(); });

test("shows Contacted and Irrelevant for NEW", () => {
  render(<LeadRowActions lead={mkLead("NEW")} token="tok" onStatusChange={vi.fn()} />);
  expect(screen.getByText("Contacted")).toBeInTheDocument();
  expect(screen.getByText("Irrelevant")).toBeInTheDocument();
});

test("shows Irrelevant and Undo for CONTACTED", () => {
  render(<LeadRowActions lead={mkLead("CONTACTED")} token="tok" onStatusChange={vi.fn()} />);
  expect(screen.getByText("Irrelevant")).toBeInTheDocument();
  expect(screen.getByText("Undo")).toBeInTheDocument();
  expect(screen.queryByText("Contacted")).not.toBeInTheDocument();
});

test("shows only Restore for SKIPPED", () => {
  render(<LeadRowActions lead={mkLead("SKIPPED")} token="tok" onStatusChange={vi.fn()} />);
  expect(screen.getByText("Restore")).toBeInTheDocument();
  expect(screen.queryByText("Irrelevant")).not.toBeInTheDocument();
  expect(screen.queryByText("Contacted")).not.toBeInTheDocument();
});

test("shows only Irrelevant for INTERESTED", () => {
  render(<LeadRowActions lead={mkLead("INTERESTED")} token="tok" onStatusChange={vi.fn()} />);
  expect(screen.getByText("Irrelevant")).toBeInTheDocument();
  expect(screen.queryByText("Contacted")).not.toBeInTheDocument();
  expect(screen.queryByText("Restore")).not.toBeInTheDocument();
});

test("clicking Contacted calls onStatusChange optimistically then calls PATCH", async () => {
  apiFetch.mockResolvedValueOnce({ lead: {} });
  const onStatusChange = vi.fn();
  render(<LeadRowActions lead={mkLead("NEW")} token="tok" onStatusChange={onStatusChange} />);
  fireEvent.click(screen.getByText("Contacted"));
  expect(onStatusChange).toHaveBeenCalledWith("lead-1", "CONTACTED");
  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith("/api/leads/lead-1", {
      token: "tok",
      method: "PATCH",
      body: { status: "CONTACTED" },
    })
  );
});

test("reverts status and shows error on API failure", async () => {
  apiFetch.mockRejectedValueOnce(new Error("network error"));
  const onStatusChange = vi.fn();
  render(<LeadRowActions lead={mkLead("NEW")} token="tok" onStatusChange={onStatusChange} />);
  fireEvent.click(screen.getByText("Irrelevant"));
  expect(onStatusChange).toHaveBeenNthCalledWith(1, "lead-1", "SKIPPED");
  await waitFor(() => {
    expect(onStatusChange).toHaveBeenNthCalledWith(2, "lead-1", "NEW");
  });
  expect(screen.getByText("Failed")).toBeInTheDocument();
});
