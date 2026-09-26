import { fmtEarnedDate, medalMetaText } from './medals';

describe('fmtEarnedDate', () => {
  it('formats an ISO date as "day FullMonth Year"', () => {
    // Noon local avoids any timezone edge where local date could shift a day
    expect(fmtEarnedDate('2025-07-29T12:00:00')).toBe('29 July 2025');
    expect(fmtEarnedDate('2025-09-17T12:00:00')).toBe('17 September 2025');
  });

  it('formats full ISO timestamps (DB unlocked_at values)', () => {
    expect(fmtEarnedDate('2025-07-29T14:23:45.000Z')).toBe(
      new Date('2025-07-29T14:23:45.000Z').getDate() === 29
        ? '29 July 2025'
        : '30 July 2025' // timezone west of UTC shifts the calendar day forward
    );
  });

  it('returns null for empty and invalid inputs', () => {
    expect(fmtEarnedDate(null)).toBeNull();
    expect(fmtEarnedDate(undefined)).toBeNull();
    expect(fmtEarnedDate('')).toBeNull();
    expect(fmtEarnedDate('not-a-date')).toBeNull();
  });
});

describe('medalMetaText', () => {
  const earned = { earnedDate: '2025-07-29T12:00:00' };
  const inProgress = { progressCurrent: 8, progressTarget: 10 };
  const zeroProgress = { progressCurrent: 0, progressTarget: 10 };
  const noData = {};

  it('Medals tab: shows the formatted earned date', () => {
    expect(medalMetaText(earned, 'medals')).toBe('29 July 2025');
  });

  it('Medals tab: not-yet-earned medals keep their progress fraction', () => {
    expect(medalMetaText(inProgress, 'medals')).toBe('8/10');
  });

  it('Medals tab: earned medal with missing earnedDate falls back to progress, no crash', () => {
    const glitched = { earnedDate: null, progressCurrent: 3, progressTarget: 10 };
    expect(medalMetaText(glitched, 'medals')).toBe('3/10');
  });

  it('Medals tab: hides the line (null) when no date and no progress data', () => {
    expect(medalMetaText(noData, 'medals')).toBeNull();
  });

  it('Medals tab: zero-progress medals show no fraction', () => {
    expect(medalMetaText(zeroProgress, 'medals')).toBeNull();
  });

  it('Badges tab: shows the progress fraction', () => {
    expect(medalMetaText(inProgress, 'badges')).toBe('8/10');
  });

  it('Badges tab: earned medals show no progress (target reached → backend sends null)', () => {
    expect(medalMetaText(earned, 'badges')).toBeNull();
  });

  it('Badges tab: hides the line for zero-progress and no-data medals', () => {
    expect(medalMetaText(zeroProgress, 'badges')).toBeNull();
    expect(medalMetaText(noData, 'badges')).toBeNull();
  });

  it('defaults to the Medals tab when no tab is given', () => {
    expect(medalMetaText(earned)).toBe('29 July 2025');
    expect(medalMetaText(inProgress)).toBe('8/10');
  });

  it('returns null for a missing medal', () => {
    expect(medalMetaText(null, 'medals')).toBeNull();
    expect(medalMetaText(null, 'badges')).toBeNull();
  });
});

describe('market medals (pickMedals)', () => {
  const { pickMedals, MEDAL_INFO } = require('./medals');
  it('has a name and picture for all 10 medals', () => {
    expect(Object.keys(MEDAL_INFO)).toHaveLength(10);
    Object.values(MEDAL_INFO).forEach((m) => { expect(m.name).toBeTruthy(); expect(m.icon).toMatch(/^\/.+\.jpg$/); });
  });
  it('shows at most 3 and counts the rest', () => {
    const r = pickMedals(['top-1-club', 'the-og', 'deca-dealer', 'clean-sheet', 'no-slip-zone']);
    expect(r.shown).toEqual(['top-1-club', 'the-og', 'deca-dealer']);
    expect(r.more).toBe(2);
  });
  it('ignores unknown ids, repeats, and non-lists', () => {
    expect(pickMedals(['nope', 'the-og', 'the-og']).shown).toEqual(['the-og']);
    expect(pickMedals(undefined)).toEqual({ shown: [], more: 0, all: [] });
    expect(pickMedals('the-og').shown).toEqual([]);
  });
});

describe('affiliate level pill (pickAffiliateLevel)', () => {
  const { pickAffiliateLevel, AFFILIATE_LEVEL_INFO } = require('./medals');
  it('has a name and colour for all 4 levels', () => {
    expect(Object.keys(AFFILIATE_LEVEL_INFO)).toHaveLength(4);
    Object.values(AFFILIATE_LEVEL_INFO).forEach((l) => { expect(l.name).toBeTruthy(); expect(l.color).toMatch(/^#/); });
  });
  it('resolves a known level id', () => {
    expect(pickAffiliateLevel({ id: 'affiliate-explorer' })).toMatchObject({ id: 'affiliate-explorer', name: 'Explorer' });
    expect(pickAffiliateLevel({ id: 'affiliate-ambassador' })).toMatchObject({ name: 'Ambassador' });
  });
  it('returns null for missing/unknown/malformed input', () => {
    expect(pickAffiliateLevel(null)).toBeNull();
    expect(pickAffiliateLevel(undefined)).toBeNull();
    expect(pickAffiliateLevel({ id: 'not-a-real-level' })).toBeNull();
    expect(pickAffiliateLevel({})).toBeNull();
  });
});
