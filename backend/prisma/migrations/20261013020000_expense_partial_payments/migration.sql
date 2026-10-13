ALTER TABLE "expenses" ADD COLUMN "paid_amount" INTEGER NOT NULL DEFAULT 0;
-- Trước đây mỗi khoản được ghi với giả định đã thanh toán đủ.
UPDATE "expenses" SET "paid_amount" = "amount";
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_amount_check"
  CHECK ("paid_amount" >= 0 AND "paid_amount" <= "amount");

CREATE TABLE "expense_supplier_payments" (
  "id" UUID NOT NULL,
  "expense_id" UUID NOT NULL,
  "client_id" VARCHAR(100) NOT NULL,
  "content_hash" VARCHAR(64) NOT NULL,
  "amount" INTEGER NOT NULL CHECK ("amount" > 0),
  "method" "PaymentMethod" NOT NULL,
  "paid_on" DATE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "expense_supplier_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "expense_supplier_payments_expense_id_fkey" FOREIGN KEY ("expense_id")
    REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "expense_supplier_payments_expense_id_client_id_key"
  ON "expense_supplier_payments"("expense_id", "client_id");
