ALTER TABLE "listings" ADD COLUMN "has_room" BOOLEAN NOT NULL DEFAULT true;

-- Older roommate posts keep their current room information until the owner chooses.
UPDATE "listings" SET "has_room" = false WHERE "type" = 'ROOM_WANTED';
