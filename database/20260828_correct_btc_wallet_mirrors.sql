-- PRAQEN — 2026-08-28 — BTC wallet mirror correction (49 verified candidates)
-- Guarded atomic update: only changes rows where current value matches expected.

BEGIN;

-- Snapshot
DROP TABLE IF EXISTS user_wallets_snapshot_20260828;
CREATE TABLE user_wallets_snapshot_20260828 AS
SELECT user_id, balance_btc AS old_balance_btc, updated_at AS old_updated_at
FROM public.user_wallets
WHERE user_id IN (
  'cb9e02d4-0adb-44b7-b6ea-cd97d674bf0a',
  'c4eac002-346e-4fc2-a851-45e6e69004e3',
  '22756fe7-83ac-4c6a-890f-eb360cf6a96d',
  '4e96b9ed-d708-4513-8af2-1fdb74d23579',
  '167f5fad-8c14-4f9d-ad66-3812e2353f64',
  '70911b12-9b78-49a7-b556-58382a3f653b',
  'cb69d316-bb63-4db3-94d1-62a8c24df848',
  '164b46ad-f251-48d4-bb71-4461232e88e4',
  'a60da341-df37-45c2-8f78-d9789c9808ba',
  '4946e386-c63e-4f57-ab06-4ade6e79ece0',
  '8bb53431-7a02-40f2-a74d-26fa10b06a11',
  'ac62848f-6427-4ca2-ad72-a7a4bd3dd475',
  '9b79803b-fd2d-4666-bb70-83fc6dd9e6e6',
  '1e9c7a7b-1dbf-4078-9429-1a0118cdcd46',
  '4bb919ca-d9e7-4253-8600-3388faba3860',
  'f2802e50-eca8-4587-a0cd-bde32c0f0eee',
  '0ed70b14-65cd-4714-8e57-0c0102e741ec',
  '6bb2ef92-74c6-46db-b707-9b70bf32d3d1',
  '55db724c-0aa5-4c1c-985e-c393cf601c31',
  '688be226-244a-4a43-a6a1-caf7c5df543b',
  'f56e3bfa-630f-4370-8733-2e84449d6be2',
  'a6622bd9-0a22-4ac4-820e-fe4b64efa881',
  '18137100-0ca3-412d-a5bb-7adcec0f0b1b',
  '0ae63cd7-dcf7-4866-bd33-12a9a1f67556',
  'a76658d4-ddef-41a4-8812-0136e1c10c55',
  '169bf33c-8a8c-45ca-a43b-62cd2782e09d',
  'e74f2d87-8f57-4dc6-bdc3-5cfc19ff67b6',
  '0121fb9c-6062-451c-bd6e-4012da23b2b2',
  '8869b588-0c30-4256-a870-90767a8c683b',
  'd2a03afe-8b06-441f-997b-a81167c7a7ba',
  'e3377b9a-4e76-4e38-936d-24a94e3c7637',
  '00b0a551-888d-4b97-8f19-fc6c4bc5d3cc',
  '54e8c750-84b8-4835-90fe-954f60d79038',
  '92c91c0e-b993-4530-b72f-5889cc30b000',
  'e2e00819-a089-4c34-9648-8c6caa482f92',
  'd30a80c2-304c-4ba6-88c3-1cb115bd6c36',
  '3a231695-420c-4cc7-898d-865c8b6f06ca',
  '2af3a00b-d3a7-41f3-b9a5-f7dc601bdd39',
  '80b750b8-b2a2-4c4d-bc98-0f87923ee902',
  'a328ea85-8fd2-4375-af88-b36750e701ec',
  '6c238a2a-e908-464d-a9a3-c92b11498ade',
  '139be266-6a9f-48f1-a51e-9f3b1cf11af2',
  'ab71df1b-176a-4af5-bd21-fd2946bfeed8',
  '937b60e0-3cfe-4a3e-a311-1c9b11b10444',
  '72547477-0929-452c-8d39-2b3832d5d989',
  '6cec7fc5-5d98-4158-9a31-af2a3f8fd774',
  'f7091160-5254-456d-b9cf-e9a7f8f2296d',
  'eaf89325-8205-4d16-81ea-d8a6c4c727da',
  '2569b808-04dc-48af-8288-698c66e7a4e3'
);

-- Guarded update with exact current values
UPDATE public.user_wallets
SET balance_btc = CASE
    WHEN user_id = 'cb9e02d4-0adb-44b7-b6ea-cd97d674bf0a' AND balance_btc = 0.02692882 THEN 0.00690471
    WHEN user_id = 'c4eac002-346e-4fc2-a851-45e6e69004e3' AND balance_btc = 0.0002413 THEN 0.01570389
    WHEN user_id = '22756fe7-83ac-4c6a-890f-eb360cf6a96d' AND balance_btc = 0.00482149 THEN 0.00001878
    WHEN user_id = '4e96b9ed-d708-4513-8af2-1fdb74d23579' AND balance_btc = 0.00427472 THEN 0.00000385
    WHEN user_id = '167f5fad-8c14-4f9d-ad66-3812e2353f64' AND balance_btc = 0.00400141 THEN 0.00013673
    WHEN user_id = '70911b12-9b78-49a7-b556-58382a3f653b' AND balance_btc = 0.00368042 THEN 0
    WHEN user_id = 'cb69d316-bb63-4db3-94d1-62a8c24df848' AND balance_btc = 0.00339535 THEN 0.00000126
    WHEN user_id = '164b46ad-f251-48d4-bb71-4461232e88e4' AND balance_btc = 0.00001423 THEN 0.00332447
    WHEN user_id = 'a60da341-df37-45c2-8f78-d9789c9808ba' AND balance_btc = 0.00306903 THEN 0.0000329
    WHEN user_id = '4946e386-c63e-4f57-ab06-4ade6e79ece0' AND balance_btc = 0.00129878 THEN 0.00000523
    WHEN user_id = '8bb53431-7a02-40f2-a74d-26fa10b06a11' AND balance_btc = 0.00127622 THEN 0
    WHEN user_id = 'ac62848f-6427-4ca2-ad72-a7a4bd3dd475' AND balance_btc = 0.00117491 THEN 0
    WHEN user_id = '9b79803b-fd2d-4666-bb70-83fc6dd9e6e6' AND balance_btc = 0.00115488 THEN 0
    WHEN user_id = '1e9c7a7b-1dbf-4078-9429-1a0118cdcd46' AND balance_btc = 0.00115214 THEN 0
    WHEN user_id = '4bb919ca-d9e7-4253-8600-3388faba3860' AND balance_btc = 0.00003181 THEN 0.00112394
    WHEN user_id = 'f2802e50-eca8-4587-a0cd-bde32c0f0eee' AND balance_btc = 0.00110591 THEN 0.00002645
    WHEN user_id = '0ed70b14-65cd-4714-8e57-0c0102e741ec' AND balance_btc = 0.00098537 THEN 8.8E-07
    WHEN user_id = '6bb2ef92-74c6-46db-b707-9b70bf32d3d1' AND balance_btc = 0.00095734 THEN 0
    WHEN user_id = '55db724c-0aa5-4c1c-985e-c393cf601c31' AND balance_btc = 0.00080948 THEN 0
    WHEN user_id = '688be226-244a-4a43-a6a1-caf7c5df543b' AND balance_btc = 0.0006635 THEN 0
    WHEN user_id = 'f56e3bfa-630f-4370-8733-2e84449d6be2' AND balance_btc = 0.00066111 THEN 0
    WHEN user_id = 'a6622bd9-0a22-4ac4-820e-fe4b64efa881' AND balance_btc = 0.00001834 THEN 0.00064794
    WHEN user_id = '18137100-0ca3-412d-a5bb-7adcec0f0b1b' AND balance_btc = 0.00059509 THEN 0
    WHEN user_id = '0ae63cd7-dcf7-4866-bd33-12a9a1f67556' AND balance_btc = 0.00058889 THEN 0
    WHEN user_id = 'a76658d4-ddef-41a4-8812-0136e1c10c55' AND balance_btc = 0.00057466 THEN 0
    WHEN user_id = '169bf33c-8a8c-45ca-a43b-62cd2782e09d' AND balance_btc = 0.00057293 THEN 7.6E-07
    WHEN user_id = 'e74f2d87-8f57-4dc6-bdc3-5cfc19ff67b6' AND balance_btc = 0.0005513 THEN 0
    WHEN user_id = '0121fb9c-6062-451c-bd6e-4012da23b2b2' AND balance_btc = 0.00054228 THEN 0
    WHEN user_id = '8869b588-0c30-4256-a870-90767a8c683b' AND balance_btc = 0.00053918 THEN 3.8E-07
    WHEN user_id = 'd2a03afe-8b06-441f-997b-a81167c7a7ba' AND balance_btc = 0.00052353 THEN 0.00000392
    WHEN user_id = 'e3377b9a-4e76-4e38-936d-24a94e3c7637' AND balance_btc = 0.00000238 THEN 0.00048447
    WHEN user_id = '00b0a551-888d-4b97-8f19-fc6c4bc5d3cc' AND balance_btc = 0.00038707 THEN 8.8E-07
    WHEN user_id = '54e8c750-84b8-4835-90fe-954f60d79038' AND balance_btc = 0.00034731 THEN 0
    WHEN user_id = '92c91c0e-b993-4530-b72f-5889cc30b000' AND balance_btc = 0 THEN 0.00027921
    WHEN user_id = 'e2e00819-a089-4c34-9648-8c6caa482f92' AND balance_btc = 0.00027715 THEN 0.0005543
    WHEN user_id = 'd30a80c2-304c-4ba6-88c3-1cb115bd6c36' AND balance_btc = 0.00129061 THEN 0.00102638
    WHEN user_id = '3a231695-420c-4cc7-898d-865c8b6f06ca' AND balance_btc = 0.00024551 THEN 0
    WHEN user_id = '2af3a00b-d3a7-41f3-b9a5-f7dc601bdd39' AND balance_btc = 0.00115889 THEN 0.00091636
    WHEN user_id = '80b750b8-b2a2-4c4d-bc98-0f87923ee902' AND balance_btc = 0.00025132 THEN 0.00001311
    WHEN user_id = 'a328ea85-8fd2-4375-af88-b36750e701ec' AND balance_btc = 0.00024173 THEN 0.00000491
    WHEN user_id = '6c238a2a-e908-464d-a9a3-c92b11498ade' AND balance_btc = 0.00046636 THEN 0.00024302
    WHEN user_id = '139be266-6a9f-48f1-a51e-9f3b1cf11af2' AND balance_btc = 0.00021829 THEN 0.00000343
    WHEN user_id = 'ab71df1b-176a-4af5-bd21-fd2946bfeed8' AND balance_btc = 0.00019802 THEN 0
    WHEN user_id = '937b60e0-3cfe-4a3e-a311-1c9b11b10444' AND balance_btc = 0.00015787 THEN 0.00031574
    WHEN user_id = '72547477-0929-452c-8d39-2b3832d5d989' AND balance_btc = 0.00015528 THEN 5.9E-07
    WHEN user_id = '6cec7fc5-5d98-4158-9a31-af2a3f8fd774' AND balance_btc = 0 THEN 0.00012998
    WHEN user_id = 'f7091160-5254-456d-b9cf-e9a7f8f2296d' AND balance_btc = 0.0000791 THEN 0
    WHEN user_id = 'eaf89325-8205-4d16-81ea-d8a6c4c727da' AND balance_btc = 0.00006336 THEN 0.00012672
    WHEN user_id = '2569b808-04dc-48af-8288-698c66e7a4e3' AND balance_btc = 0 THEN 0.00000585
  END,
  updated_at = NOW()
WHERE user_id IN (
  'cb9e02d4-0adb-44b7-b6ea-cd97d674bf0a',
  'c4eac002-346e-4fc2-a851-45e6e69004e3',
  '22756fe7-83ac-4c6a-890f-eb360cf6a96d',
  '4e96b9ed-d708-4513-8af2-1fdb74d23579',
  '167f5fad-8c14-4f9d-ad66-3812e2353f64',
  '70911b12-9b78-49a7-b556-58382a3f653b',
  'cb69d316-bb63-4db3-94d1-62a8c24df848',
  '164b46ad-f251-48d4-bb71-4461232e88e4',
  'a60da341-df37-45c2-8f78-d9789c9808ba',
  '4946e386-c63e-4f57-ab06-4ade6e79ece0',
  '8bb53431-7a02-40f2-a74d-26fa10b06a11',
  'ac62848f-6427-4ca2-ad72-a7a4bd3dd475',
  '9b79803b-fd2d-4666-bb70-83fc6dd9e6e6',
  '1e9c7a7b-1dbf-4078-9429-1a0118cdcd46',
  '4bb919ca-d9e7-4253-8600-3388faba3860',
  'f2802e50-eca8-4587-a0cd-bde32c0f0eee',
  '0ed70b14-65cd-4714-8e57-0c0102e741ec',
  '6bb2ef92-74c6-46db-b707-9b70bf32d3d1',
  '55db724c-0aa5-4c1c-985e-c393cf601c31',
  '688be226-244a-4a43-a6a1-caf7c5df543b',
  'f56e3bfa-630f-4370-8733-2e84449d6be2',
  'a6622bd9-0a22-4ac4-820e-fe4b64efa881',
  '18137100-0ca3-412d-a5bb-7adcec0f0b1b',
  '0ae63cd7-dcf7-4866-bd33-12a9a1f67556',
  'a76658d4-ddef-41a4-8812-0136e1c10c55',
  '169bf33c-8a8c-45ca-a43b-62cd2782e09d',
  'e74f2d87-8f57-4dc6-bdc3-5cfc19ff67b6',
  '0121fb9c-6062-451c-bd6e-4012da23b2b2',
  '8869b588-0c30-4256-a870-90767a8c683b',
  'd2a03afe-8b06-441f-997b-a81167c7a7ba',
  'e3377b9a-4e76-4e38-936d-24a94e3c7637',
  '00b0a551-888d-4b97-8f19-fc6c4bc5d3cc',
  '54e8c750-84b8-4835-90fe-954f60d79038',
  '92c91c0e-b993-4530-b72f-5889cc30b000',
  'e2e00819-a089-4c34-9648-8c6caa482f92',
  'd30a80c2-304c-4ba6-88c3-1cb115bd6c36',
  '3a231695-420c-4cc7-898d-865c8b6f06ca',
  '2af3a00b-d3a7-41f3-b9a5-f7dc601bdd39',
  '80b750b8-b2a2-4c4d-bc98-0f87923ee902',
  'a328ea85-8fd2-4375-af88-b36750e701ec',
  '6c238a2a-e908-464d-a9a3-c92b11498ade',
  '139be266-6a9f-48f1-a51e-9f3b1cf11af2',
  'ab71df1b-176a-4af5-bd21-fd2946bfeed8',
  '937b60e0-3cfe-4a3e-a311-1c9b11b10444',
  '72547477-0929-452c-8d39-2b3832d5d989',
  '6cec7fc5-5d98-4158-9a31-af2a3f8fd774',
  'f7091160-5254-456d-b9cf-e9a7f8f2296d',
  'eaf89325-8205-4d16-81ea-d8a6c4c727da',
  '2569b808-04dc-48af-8288-698c66e7a4e3'
)
AND (
  (user_id = 'cb9e02d4-0adb-44b7-b6ea-cd97d674bf0a' AND balance_btc = 0.02692882) OR 
  (user_id = 'c4eac002-346e-4fc2-a851-45e6e69004e3' AND balance_btc = 0.0002413) OR 
  (user_id = '22756fe7-83ac-4c6a-890f-eb360cf6a96d' AND balance_btc = 0.00482149) OR 
  (user_id = '4e96b9ed-d708-4513-8af2-1fdb74d23579' AND balance_btc = 0.00427472) OR 
  (user_id = '167f5fad-8c14-4f9d-ad66-3812e2353f64' AND balance_btc = 0.00400141) OR 
  (user_id = '70911b12-9b78-49a7-b556-58382a3f653b' AND balance_btc = 0.00368042) OR 
  (user_id = 'cb69d316-bb63-4db3-94d1-62a8c24df848' AND balance_btc = 0.00339535) OR 
  (user_id = '164b46ad-f251-48d4-bb71-4461232e88e4' AND balance_btc = 0.00001423) OR 
  (user_id = 'a60da341-df37-45c2-8f78-d9789c9808ba' AND balance_btc = 0.00306903) OR 
  (user_id = '4946e386-c63e-4f57-ab06-4ade6e79ece0' AND balance_btc = 0.00129878) OR 
  (user_id = '8bb53431-7a02-40f2-a74d-26fa10b06a11' AND balance_btc = 0.00127622) OR 
  (user_id = 'ac62848f-6427-4ca2-ad72-a7a4bd3dd475' AND balance_btc = 0.00117491) OR 
  (user_id = '9b79803b-fd2d-4666-bb70-83fc6dd9e6e6' AND balance_btc = 0.00115488) OR 
  (user_id = '1e9c7a7b-1dbf-4078-9429-1a0118cdcd46' AND balance_btc = 0.00115214) OR 
  (user_id = '4bb919ca-d9e7-4253-8600-3388faba3860' AND balance_btc = 0.00003181) OR 
  (user_id = 'f2802e50-eca8-4587-a0cd-bde32c0f0eee' AND balance_btc = 0.00110591) OR 
  (user_id = '0ed70b14-65cd-4714-8e57-0c0102e741ec' AND balance_btc = 0.00098537) OR 
  (user_id = '6bb2ef92-74c6-46db-b707-9b70bf32d3d1' AND balance_btc = 0.00095734) OR 
  (user_id = '55db724c-0aa5-4c1c-985e-c393cf601c31' AND balance_btc = 0.00080948) OR 
  (user_id = '688be226-244a-4a43-a6a1-caf7c5df543b' AND balance_btc = 0.0006635) OR 
  (user_id = 'f56e3bfa-630f-4370-8733-2e84449d6be2' AND balance_btc = 0.00066111) OR 
  (user_id = 'a6622bd9-0a22-4ac4-820e-fe4b64efa881' AND balance_btc = 0.00001834) OR 
  (user_id = '18137100-0ca3-412d-a5bb-7adcec0f0b1b' AND balance_btc = 0.00059509) OR 
  (user_id = '0ae63cd7-dcf7-4866-bd33-12a9a1f67556' AND balance_btc = 0.00058889) OR 
  (user_id = 'a76658d4-ddef-41a4-8812-0136e1c10c55' AND balance_btc = 0.00057466) OR 
  (user_id = '169bf33c-8a8c-45ca-a43b-62cd2782e09d' AND balance_btc = 0.00057293) OR 
  (user_id = 'e74f2d87-8f57-4dc6-bdc3-5cfc19ff67b6' AND balance_btc = 0.0005513) OR 
  (user_id = '0121fb9c-6062-451c-bd6e-4012da23b2b2' AND balance_btc = 0.00054228) OR 
  (user_id = '8869b588-0c30-4256-a870-90767a8c683b' AND balance_btc = 0.00053918) OR 
  (user_id = 'd2a03afe-8b06-441f-997b-a81167c7a7ba' AND balance_btc = 0.00052353) OR 
  (user_id = 'e3377b9a-4e76-4e38-936d-24a94e3c7637' AND balance_btc = 0.00000238) OR 
  (user_id = '00b0a551-888d-4b97-8f19-fc6c4bc5d3cc' AND balance_btc = 0.00038707) OR 
  (user_id = '54e8c750-84b8-4835-90fe-954f60d79038' AND balance_btc = 0.00034731) OR 
  (user_id = '92c91c0e-b993-4530-b72f-5889cc30b000' AND balance_btc = 0) OR 
  (user_id = 'e2e00819-a089-4c34-9648-8c6caa482f92' AND balance_btc = 0.00027715) OR 
  (user_id = 'd30a80c2-304c-4ba6-88c3-1cb115bd6c36' AND balance_btc = 0.00129061) OR 
  (user_id = '3a231695-420c-4cc7-898d-865c8b6f06ca' AND balance_btc = 0.00024551) OR 
  (user_id = '2af3a00b-d3a7-41f3-b9a5-f7dc601bdd39' AND balance_btc = 0.00115889) OR 
  (user_id = '80b750b8-b2a2-4c4d-bc98-0f87923ee902' AND balance_btc = 0.00025132) OR 
  (user_id = 'a328ea85-8fd2-4375-af88-b36750e701ec' AND balance_btc = 0.00024173) OR 
  (user_id = '6c238a2a-e908-464d-a9a3-c92b11498ade' AND balance_btc = 0.00046636) OR 
  (user_id = '139be266-6a9f-48f1-a51e-9f3b1cf11af2' AND balance_btc = 0.00021829) OR 
  (user_id = 'ab71df1b-176a-4af5-bd21-fd2946bfeed8' AND balance_btc = 0.00019802) OR 
  (user_id = '937b60e0-3cfe-4a3e-a311-1c9b11b10444' AND balance_btc = 0.00015787) OR 
  (user_id = '72547477-0929-452c-8d39-2b3832d5d989' AND balance_btc = 0.00015528) OR 
  (user_id = '6cec7fc5-5d98-4158-9a31-af2a3f8fd774' AND balance_btc = 0) OR 
  (user_id = 'f7091160-5254-456d-b9cf-e9a7f8f2296d' AND balance_btc = 0.0000791) OR 
  (user_id = 'eaf89325-8205-4d16-81ea-d8a6c4c727da' AND balance_btc = 0.00006336) OR 
  (user_id = '2569b808-04dc-48af-8288-698c66e7a4e3' AND balance_btc = 0)
);

-- Verify all 49 updated
DO $verify$
DECLARE
  v_updated integer;
  v_expected integer := 49;
BEGIN
  SELECT COUNT(*)
  INTO v_updated
  FROM public.user_wallets uw
  JOIN public.wallets w ON w.user_id = uw.user_id
  WHERE uw.user_id IN (
    'cb9e02d4-0adb-44b7-b6ea-cd97d674bf0a',
  'c4eac002-346e-4fc2-a851-45e6e69004e3',
  '22756fe7-83ac-4c6a-890f-eb360cf6a96d',
  '4e96b9ed-d708-4513-8af2-1fdb74d23579',
  '167f5fad-8c14-4f9d-ad66-3812e2353f64',
  '70911b12-9b78-49a7-b556-58382a3f653b',
  'cb69d316-bb63-4db3-94d1-62a8c24df848',
  '164b46ad-f251-48d4-bb71-4461232e88e4',
  'a60da341-df37-45c2-8f78-d9789c9808ba',
  '4946e386-c63e-4f57-ab06-4ade6e79ece0',
  '8bb53431-7a02-40f2-a74d-26fa10b06a11',
  'ac62848f-6427-4ca2-ad72-a7a4bd3dd475',
  '9b79803b-fd2d-4666-bb70-83fc6dd9e6e6',
  '1e9c7a7b-1dbf-4078-9429-1a0118cdcd46',
  '4bb919ca-d9e7-4253-8600-3388faba3860',
  'f2802e50-eca8-4587-a0cd-bde32c0f0eee',
  '0ed70b14-65cd-4714-8e57-0c0102e741ec',
  '6bb2ef92-74c6-46db-b707-9b70bf32d3d1',
  '55db724c-0aa5-4c1c-985e-c393cf601c31',
  '688be226-244a-4a43-a6a1-caf7c5df543b',
  'f56e3bfa-630f-4370-8733-2e84449d6be2',
  'a6622bd9-0a22-4ac4-820e-fe4b64efa881',
  '18137100-0ca3-412d-a5bb-7adcec0f0b1b',
  '0ae63cd7-dcf7-4866-bd33-12a9a1f67556',
  'a76658d4-ddef-41a4-8812-0136e1c10c55',
  '169bf33c-8a8c-45ca-a43b-62cd2782e09d',
  'e74f2d87-8f57-4dc6-bdc3-5cfc19ff67b6',
  '0121fb9c-6062-451c-bd6e-4012da23b2b2',
  '8869b588-0c30-4256-a870-90767a8c683b',
  'd2a03afe-8b06-441f-997b-a81167c7a7ba',
  'e3377b9a-4e76-4e38-936d-24a94e3c7637',
  '00b0a551-888d-4b97-8f19-fc6c4bc5d3cc',
  '54e8c750-84b8-4835-90fe-954f60d79038',
  '92c91c0e-b993-4530-b72f-5889cc30b000',
  'e2e00819-a089-4c34-9648-8c6caa482f92',
  'd30a80c2-304c-4ba6-88c3-1cb115bd6c36',
  '3a231695-420c-4cc7-898d-865c8b6f06ca',
  '2af3a00b-d3a7-41f3-b9a5-f7dc601bdd39',
  '80b750b8-b2a2-4c4d-bc98-0f87923ee902',
  'a328ea85-8fd2-4375-af88-b36750e701ec',
  '6c238a2a-e908-464d-a9a3-c92b11498ade',
  '139be266-6a9f-48f1-a51e-9f3b1cf11af2',
  'ab71df1b-176a-4af5-bd21-fd2946bfeed8',
  '937b60e0-3cfe-4a3e-a311-1c9b11b10444',
  '72547477-0929-452c-8d39-2b3832d5d989',
  '6cec7fc5-5d98-4158-9a31-af2a3f8fd774',
  'f7091160-5254-456d-b9cf-e9a7f8f2296d',
  'eaf89325-8205-4d16-81ea-d8a6c4c727da',
  '2569b808-04dc-48af-8288-698c66e7a4e3'
  )
  AND uw.balance_btc = w.balance_btc;

  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'Correction incomplete: expected %, got %', v_expected, v_updated;
  END IF;
END $verify$;

COMMIT;
