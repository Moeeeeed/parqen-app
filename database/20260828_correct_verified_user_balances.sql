-- PRAQEN — 2026-08-28 — Correct 12 VERIFIED user_balances mismatches (FULLY GUARDED)

BEGIN;

-- Snapshot
CREATE TABLE IF NOT EXISTS user_balances_snapshot_20260828_verified AS
SELECT user_id, balance_btc AS old_balance_btc, updated_at AS old_updated_at
FROM public.user_balances
WHERE user_id IN (
  'd020a6cf-c33c-436c-bc3c-eaaf6ca77f96',
  '426703b0-96f4-4be1-b576-edd79c14afac',
  '5cad7edc-8493-4fed-b36e-967e20a174d1',
  '51e54fde-e87c-4517-b228-724e98a5f4fd',
  'd73761ad-9477-4f8f-aa1e-f925987d1f0d',
  '0d139b9c-e550-4226-a272-27c02ac906c4',
  '0b8f36d2-bfbb-42ea-8345-ac7b4c931042',
  'c8544d19-830e-4115-b3be-2c13457452ce',
  '06264859-3c0b-400e-9243-6790013867fa',
  'f980f044-49ca-469b-9c43-98378abf08d3',
  '437ba036-cca8-4819-939e-5f4565fb9d20',
  '26e10fdd-4eba-4571-bc85-3e4e96d78122'
);

-- Guarded UPDATE with exact current values
DO $update$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.user_balances
  SET balance_btc = CASE
    WHEN user_id = 'd020a6cf-c33c-436c-bc3c-eaaf6ca77f96' AND balance_btc = 0.0014787 THEN 0.00000514
    WHEN user_id = '426703b0-96f4-4be1-b576-edd79c14afac' AND balance_btc = 0.00094701 THEN 0.00011081
    WHEN user_id = '5cad7edc-8493-4fed-b36e-967e20a174d1' AND balance_btc = 0.00579924 THEN 0.00163995
    WHEN user_id = '51e54fde-e87c-4517-b228-724e98a5f4fd' AND balance_btc = 0.0002309 THEN 5.2E-07
    WHEN user_id = 'd73761ad-9477-4f8f-aa1e-f925987d1f0d' AND balance_btc = 0 THEN 0.0002047
    WHEN user_id = '0d139b9c-e550-4226-a272-27c02ac906c4' AND balance_btc = 0 THEN 0.00010404
    WHEN user_id = '0b8f36d2-bfbb-42ea-8345-ac7b4c931042' AND balance_btc = 0.00737818 THEN 0.00005954
    WHEN user_id = 'c8544d19-830e-4115-b3be-2c13457452ce' AND balance_btc = 0.00095503 THEN 0.00003869
    WHEN user_id = '06264859-3c0b-400e-9243-6790013867fa' AND balance_btc = 0.000466 THEN 0.00000577
    WHEN user_id = 'f980f044-49ca-469b-9c43-98378abf08d3' AND balance_btc = 0.00083205 THEN 8.3E-07
    WHEN user_id = '437ba036-cca8-4819-939e-5f4565fb9d20' AND balance_btc = 0.00024474 THEN 0.00048948
    WHEN user_id = '26e10fdd-4eba-4571-bc85-3e4e96d78122' AND balance_btc = 0 THEN 0.00033706
  END,
  updated_at = NOW()
  WHERE user_id IN (
    'd020a6cf-c33c-436c-bc3c-eaaf6ca77f96',
  '426703b0-96f4-4be1-b576-edd79c14afac',
  '5cad7edc-8493-4fed-b36e-967e20a174d1',
  '51e54fde-e87c-4517-b228-724e98a5f4fd',
  'd73761ad-9477-4f8f-aa1e-f925987d1f0d',
  '0d139b9c-e550-4226-a272-27c02ac906c4',
  '0b8f36d2-bfbb-42ea-8345-ac7b4c931042',
  'c8544d19-830e-4115-b3be-2c13457452ce',
  '06264859-3c0b-400e-9243-6790013867fa',
  'f980f044-49ca-469b-9c43-98378abf08d3',
  '437ba036-cca8-4819-939e-5f4565fb9d20',
  '26e10fdd-4eba-4571-bc85-3e4e96d78122'
  )
  AND (
    (user_id = 'd020a6cf-c33c-436c-bc3c-eaaf6ca77f96' AND balance_btc = 0.0014787) OR 
  (user_id = '426703b0-96f4-4be1-b576-edd79c14afac' AND balance_btc = 0.00094701) OR 
  (user_id = '5cad7edc-8493-4fed-b36e-967e20a174d1' AND balance_btc = 0.00579924) OR 
  (user_id = '51e54fde-e87c-4517-b228-724e98a5f4fd' AND balance_btc = 0.0002309) OR 
  (user_id = 'd73761ad-9477-4f8f-aa1e-f925987d1f0d' AND balance_btc = 0) OR 
  (user_id = '0d139b9c-e550-4226-a272-27c02ac906c4' AND balance_btc = 0) OR 
  (user_id = '0b8f36d2-bfbb-42ea-8345-ac7b4c931042' AND balance_btc = 0.00737818) OR 
  (user_id = 'c8544d19-830e-4115-b3be-2c13457452ce' AND balance_btc = 0.00095503) OR 
  (user_id = '06264859-3c0b-400e-9243-6790013867fa' AND balance_btc = 0.000466) OR 
  (user_id = 'f980f044-49ca-469b-9c43-98378abf08d3' AND balance_btc = 0.00083205) OR 
  (user_id = '437ba036-cca8-4819-939e-5f4565fb9d20' AND balance_btc = 0.00024474) OR 
  (user_id = '26e10fdd-4eba-4571-bc85-3e4e96d78122' AND balance_btc = 0)
  );

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count <> 12 THEN
    RAISE EXCEPTION 'ABORT: expected 12 updates, got %', updated_count;
  END IF;
END;
$update$;

-- Verify zero remaining mismatches for these 12
DO $verify$
DECLARE
  remaining_mismatch INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO remaining_mismatch
  FROM public.user_balances ub
  JOIN public.wallets w ON w.user_id = ub.user_id
  WHERE ub.user_id IN (
    'd020a6cf-c33c-436c-bc3c-eaaf6ca77f96',
  '426703b0-96f4-4be1-b576-edd79c14afac',
  '5cad7edc-8493-4fed-b36e-967e20a174d1',
  '51e54fde-e87c-4517-b228-724e98a5f4fd',
  'd73761ad-9477-4f8f-aa1e-f925987d1f0d',
  '0d139b9c-e550-4226-a272-27c02ac906c4',
  '0b8f36d2-bfbb-42ea-8345-ac7b4c931042',
  'c8544d19-830e-4115-b3be-2c13457452ce',
  '06264859-3c0b-400e-9243-6790013867fa',
  'f980f044-49ca-469b-9c43-98378abf08d3',
  '437ba036-cca8-4819-939e-5f4565fb9d20',
  '26e10fdd-4eba-4571-bc85-3e4e96d78122'
  )
  AND ub.balance_btc <> w.balance_btc;

  IF remaining_mismatch <> 0 THEN
    RAISE EXCEPTION 'ABORT: % verified mismatches remain', remaining_mismatch;
  END IF;
END;
$verify$;

COMMIT;
