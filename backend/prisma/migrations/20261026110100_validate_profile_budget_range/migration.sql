-- Existing inconsistent budgets must be reviewed before this migration runs.
-- Validation fails rather than silently changing either of the user's bounds.
ALTER TABLE "profiles" VALIDATE CONSTRAINT "profiles_budget_range_valid";
