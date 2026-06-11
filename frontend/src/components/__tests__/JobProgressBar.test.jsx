import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { SessionProvider } from "next-auth/react";
import JobProgressBar from "../JobProgressBar";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
import { apiFetch } from "@/lib/api";

function wrap(ui) {
  return render(<SessionProvider session={{ backendToken: "tok" }}>{ui}</SessionProvider>);
}

afterEach(() => { vi.clearAllMocks(); });

test("shows an account/key-provisioning message (not a quota message) for the search 402", async () => {
  apiFetch.mockResolvedValueOnce({
    job: {
      id: "job-1",
      state: "failed",
      output: { message: "lusha_search_failed_402: You've reached your credit limit. Upgrade your account for more credits" },
      retryCount: 0
    }
  });

  wrap(<JobProgressBar jobId="job-1" />);

  await waitFor(() => {
    expect(screen.getByText(/isn't provisioned for prospecting\/search/i)).toBeInTheDocument();
  });
  expect(screen.queryByText(/quota reached/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/plan doesn't include/i)).not.toBeInTheDocument();
});

test("still shows the raw failure message for non-Lusha-quota failures", async () => {
  apiFetch.mockResolvedValueOnce({
    job: {
      id: "job-2",
      state: "failed",
      output: { message: "campaign cmabc not found" },
      retryCount: 0
    }
  });

  wrap(<JobProgressBar jobId="job-2" />);

  await waitFor(() => {
    expect(screen.getByText("campaign cmabc not found")).toBeInTheDocument();
  });
});

test("calls onFailed(true) when the failure is the Lusha credit-limit/plan-restriction error", async () => {
  apiFetch.mockResolvedValueOnce({
    job: {
      id: "job-3",
      state: "failed",
      output: { message: "lusha_search_failed_402: You've reached your credit limit. Upgrade your account for more credits" },
      retryCount: 0
    }
  });
  const onFailed = vi.fn();

  wrap(<JobProgressBar jobId="job-3" onFailed={onFailed} />);

  await waitFor(() => {
    expect(onFailed).toHaveBeenCalledWith(true);
  });
});

test("calls onFailed(false) for other failures", async () => {
  apiFetch.mockResolvedValueOnce({
    job: {
      id: "job-4",
      state: "failed",
      output: { message: "campaign cmabc not found" },
      retryCount: 0
    }
  });
  const onFailed = vi.fn();

  wrap(<JobProgressBar jobId="job-4" onFailed={onFailed} />);

  await waitFor(() => {
    expect(onFailed).toHaveBeenCalledWith(false);
  });
});
