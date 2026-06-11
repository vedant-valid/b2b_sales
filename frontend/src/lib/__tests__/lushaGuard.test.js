import { shouldRerun, LUSHA_RERUN_CONFIRM_MESSAGE } from "../lushaGuard";

test("allows rerun without confirmation when not Lusha-blocked", () => {
  const confirmFn = vi.fn();

  const result = shouldRerun(false, confirmFn);

  expect(result).toBe(true);
  expect(confirmFn).not.toHaveBeenCalled();
});

test("asks for confirmation before rerunning when Lusha-blocked", () => {
  const confirmFn = vi.fn().mockReturnValue(true);

  const result = shouldRerun(true, confirmFn);

  expect(confirmFn).toHaveBeenCalledWith(LUSHA_RERUN_CONFIRM_MESSAGE);
  expect(result).toBe(true);
});

test("returns false when the user declines the confirmation", () => {
  const confirmFn = vi.fn().mockReturnValue(false);

  const result = shouldRerun(true, confirmFn);

  expect(result).toBe(false);
});
