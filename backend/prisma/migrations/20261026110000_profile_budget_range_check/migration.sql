-- Enforce new writes without scanning or rewriting existing profile data.
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_budget_range_valid"
CHECK (
  "budget_min" IS NULL OR "budget_max" IS NULL OR "budget_min" <= "budget_max"
) NOT VALID;
