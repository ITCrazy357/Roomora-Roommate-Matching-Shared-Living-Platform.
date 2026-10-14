CREATE TABLE ai_house_summaries (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  house_id UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  month VARCHAR(7) NOT NULL CHECK (month ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$'),
  total INTEGER,
  highlights TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  generated_at TIMESTAMP(3),
  notes VARCHAR(5000) NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0,
  generation_id UUID,
  generating_until TIMESTAMP(3),
  PRIMARY KEY (user_id, house_id, month)
);
CREATE INDEX ai_house_summaries_house_id_idx ON ai_house_summaries(house_id);
