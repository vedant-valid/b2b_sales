export const LUSHA_RERUN_CONFIRM_MESSAGE =
  "The previous attempt failed because Lusha's Prospecting/Search isn't enabled on this plan. " +
  "Running again will likely fail the same way and will still consume Lusha credits. Run anyway?";

export function shouldRerun(lushaBlocked, confirmFn) {
  if (!lushaBlocked) return true;
  return confirmFn(LUSHA_RERUN_CONFIRM_MESSAGE);
}
