import { redirect } from "next/navigation";
import { vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

test("home redirects to /dashboard", async () => {
  const { default: Home } = await import("../page.jsx");
  Home();
  expect(redirect).toHaveBeenCalledWith("/dashboard");
});
