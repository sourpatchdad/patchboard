-- Game Night: legacy-data audit. READ ONLY.
--
-- Lists existing bets that break the input rules the app now enforces on
-- create and on side edits:
--   * the same player on more than one side of one bet
--   * a side amount below 1, missing, or not a whole number
-- Output identifies records only: bet id, date placed, open/resolved, the
-- rule, the side positions (1-based, in display order) and, for repeated
-- players, the player id. No descriptions, labels, names or amounts.
-- (bet_sides.amount is INTEGER, so "non-integer" can only ever be 0 rows;
-- it is listed so the summary covers every rule.)
--
-- The whole script runs in BEGIN READ ONLY ... ROLLBACK, so it cannot write.
-- Nothing is fixed here.
--
-- Run on the NAS, from the directory holding this file. psql runs inside the
-- db container as the container's own user over its local socket, so no
-- password is typed or stored in shell history:
--   docker exec -i game-night-db sh -c 'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < scripts/audit-bets.sql

\set ON_ERROR_STOP on
\pset footer off
BEGIN TRANSACTION READ ONLY;

-- Rows: one per broken rule per bet.
WITH ordered AS (
  SELECT bs.bet_id, bs.player_id, bs.amount,
         ROW_NUMBER() OVER (PARTITION BY bs.bet_id ORDER BY bs.id) AS side_no
  FROM bet_sides bs
), audit_violations AS (
SELECT bet_id, 'same player on more than one side'::text AS rule,
       string_agg(side_no::text, ',' ORDER BY side_no) AS side_positions,
       player_id
FROM ordered GROUP BY bet_id, player_id HAVING COUNT(*) > 1
UNION ALL
SELECT bet_id, 'amount < 1', side_no::text, NULL FROM ordered WHERE amount < 1
UNION ALL
SELECT bet_id, 'amount missing', side_no::text, NULL FROM ordered WHERE amount IS NULL
UNION ALL
SELECT bet_id, 'amount non-integer', side_no::text, NULL FROM ordered
WHERE amount::numeric <> trunc(amount::numeric)
)
SELECT v.bet_id, b.date_placed,
       CASE WHEN b.status = 'closed' THEN 'resolved' ELSE 'open' END AS status,
       v.rule, v.side_positions, v.player_id
FROM audit_violations v JOIN bets b ON b.id = v.bet_id
ORDER BY v.bet_id, v.rule, v.side_positions;

-- One summary row.
WITH ordered AS (
  SELECT bs.bet_id, bs.player_id, bs.amount,
         ROW_NUMBER() OVER (PARTITION BY bs.bet_id ORDER BY bs.id) AS side_no
  FROM bet_sides bs
), audit_violations AS (
SELECT bet_id, 'same player on more than one side'::text AS rule,
       string_agg(side_no::text, ',' ORDER BY side_no) AS side_positions,
       player_id
FROM ordered GROUP BY bet_id, player_id HAVING COUNT(*) > 1
UNION ALL
SELECT bet_id, 'amount < 1', side_no::text, NULL FROM ordered WHERE amount < 1
UNION ALL
SELECT bet_id, 'amount missing', side_no::text, NULL FROM ordered WHERE amount IS NULL
UNION ALL
SELECT bet_id, 'amount non-integer', side_no::text, NULL FROM ordered
WHERE amount::numeric <> trunc(amount::numeric)
)
SELECT (SELECT COUNT(*) FROM bets) AS bets_scanned,
       COUNT(*) FILTER (WHERE rule = 'same player on more than one side') AS repeated_player,
       COUNT(*) FILTER (WHERE rule = 'amount < 1') AS amount_below_1,
       COUNT(*) FILTER (WHERE rule = 'amount missing') AS amount_missing,
       COUNT(*) FILTER (WHERE rule = 'amount non-integer') AS amount_non_integer
FROM audit_violations;

ROLLBACK;
