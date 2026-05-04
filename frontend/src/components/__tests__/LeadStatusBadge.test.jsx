import { render, screen } from "@testing-library/react";
import LeadStatusBadge from "../LeadStatusBadge";

test("renders 'New' for NEW status", () => {
  render(<LeadStatusBadge status="NEW" />);
  expect(screen.getByText("New")).toBeInTheDocument();
});

test("renders 'Irrelevant' (not 'Skipped') for SKIPPED status", () => {
  render(<LeadStatusBadge status="SKIPPED" />);
  expect(screen.getByText("Irrelevant")).toBeInTheDocument();
  expect(screen.queryByText("Skipped")).not.toBeInTheDocument();
});

test("renders 'Contacted' for CONTACTED status", () => {
  render(<LeadStatusBadge status="CONTACTED" />);
  expect(screen.getByText("Contacted")).toBeInTheDocument();
});

test("applies green class for INTERESTED", () => {
  const { container } = render(<LeadStatusBadge status="INTERESTED" />);
  expect(container.firstChild.className).toContain("bg-green-100");
});

test("applies orange class for SKIPPED", () => {
  const { container } = render(<LeadStatusBadge status="SKIPPED" />);
  expect(container.firstChild.className).toContain("bg-orange-100");
});

test("falls back gracefully for unknown status", () => {
  render(<LeadStatusBadge status="UNKNOWN_FUTURE_STATUS" />);
  expect(screen.getByText("UNKNOWN_FUTURE_STATUS")).toBeInTheDocument();
});
