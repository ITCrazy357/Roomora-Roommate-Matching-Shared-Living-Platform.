-- CreateTable
CREATE TABLE "debt_payment_proofs" (
    "payment_id" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "mime_type" VARCHAR(30) NOT NULL DEFAULT 'image/jpeg',

    CONSTRAINT "debt_payment_proofs_pkey" PRIMARY KEY ("payment_id")
);

-- AddForeignKey
ALTER TABLE "debt_payment_proofs" ADD CONSTRAINT "debt_payment_proofs_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "debt_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
