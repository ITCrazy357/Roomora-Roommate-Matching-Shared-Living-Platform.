ALTER TABLE "appointments" ALTER COLUMN "listing_id" DROP NOT NULL;

ALTER TABLE "appointments" DROP CONSTRAINT "appointments_listing_id_fkey";
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
