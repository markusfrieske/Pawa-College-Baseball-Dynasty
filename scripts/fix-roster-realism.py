#!/usr/bin/env python3
"""
fix-roster-realism.py
Applies bulk realism fixes to NCAA 2026 roster source TypeScript files:
  1. Hitter contact/power splits (hitForAvg=power AND both>65 → position-based adjustment)
  2. Reduce Contact Hitter below 280
  3. Reduce Guts below 220
  4. Reduce Sharpness below 220
  5. Add Walk to pitchers (target ≥25 total)
  6. Add Slow Starter / Glass Heart to pitchers (target ≥20 combined)
"""

import re
import os

ROSTER_FILES = [
    'server/secBatch1.ts',
    'server/secBatch2.ts',
    'server/secBatch3.ts',
    'server/accRostersBatch1.ts',
    'server/accRostersBatch2.ts',
    'server/accRostersBatch3.ts',
    'server/bigTenBatch1.ts',
    'server/bigTenBatch2.ts',
    'server/bigTenBatch3.ts',
    'server/big12Rosters.ts',
    'server/pac12Rosters.ts',
    'server/mwcRosters.ts',
    'server/aacRosters.ts',
    'server/sunBeltRosters.ts',
    'server/wccRosters.ts',
    'server/bigWestRosters.ts',
    'server/moValleyRosters.ts',
    'server/ivyLeagueRosters.ts',
    'server/hbcuRosters.ts',
]

PITCHER_POSITIONS = {'P', 'SP', 'RP', 'CP'}

# Position-based hit/pow adjustment when hit=pow and both>65
# Positive = increase that stat, negative = decrease
POSITION_ADJUST = {
    'C':   {'hit': -6, 'power': +6},
    '1B':  {'hit': -5, 'power': +5},
    '3B':  {'hit': -4, 'power': +4},
    'SS':  {'hit': +6, 'power': -6},
    '2B':  {'hit': +5, 'power': -5},
    'OF':  {'hit': -5, 'power': +5},
    'LF':  {'hit': -5, 'power': +5},
    'CF':  {'hit': -3, 'power': +3},
    'RF':  {'hit': -5, 'power': +5},
    'DH':  {'hit': -6, 'power': +6},
    'INF': {'hit': +4, 'power': -4},
    'UTL': {'hit': -3, 'power': +3},
}

# Running totals (updated as we go)
totals = {
    'Contact Hitter': 0,
    'Guts': 0,
    'Sharpness': 0,
    'Walk': 0,
    'Slow Starter': 0,
    'Glass Heart': 0,
}

# Targets
LIMITS = {'Contact Hitter': 279, 'Guts': 219, 'Sharpness': 219}
MINS   = {'Walk': 25, 'neg_combo': 20}

changes = {
    'hitter_splits': 0,
    'contact_hitter_removed': 0,
    'guts_removed': 0,
    'sharpness_removed': 0,
    'walk_added': 0,
    'slow_starter_added': 0,
    'glass_heart_added': 0,
}

# ──────────────────────────────────────────────────────────────────────────────
# Pass 1: count existing totals
# ──────────────────────────────────────────────────────────────────────────────
def count_totals():
    for filepath in ROSTER_FILES:
        if not os.path.exists(filepath):
            continue
        with open(filepath) as f:
            for line in f:
                m = re.search(r'abilities:\s*\[([^\]]*)\]', line)
                if m:
                    for ab in re.findall(r'"([^"]+)"', m.group(1)):
                        if ab in totals:
                            totals[ab] += 1

# ──────────────────────────────────────────────────────────────────────────────
# Pass 2: apply changes
# ──────────────────────────────────────────────────────────────────────────────
def parse_abilities(arr_str):
    return re.findall(r'"([^"]+)"', arr_str)

def format_abilities(abilities):
    if not abilities:
        return '[]'
    return '[' + ', '.join(f'"{a}"' for a in abilities) + ']'

def process_file(filepath):
    if not os.path.exists(filepath):
        return

    with open(filepath) as f:
        lines = f.readlines()

    new_lines = []
    cur_pos = None
    cur_eli = None
    cur_vel = None
    cur_ctrl = None
    cur_grit = None
    is_pitcher = False

    for line in lines:
        nl = line

        # Track player position and eligibility (first line of each player object)
        pm = re.search(r'position:\s*"([^"]+)"', line)
        em = re.search(r'eligibility:\s*"([^"]+)"', line)
        if pm:
            cur_pos = pm.group(1)
            is_pitcher = cur_pos in PITCHER_POSITIONS
        if em:
            cur_eli = em.group(1)

        # Track pitcher attrs for negative ability assignment
        vm = re.search(r'velocity:\s*(\d+)', line)
        cm = re.search(r'\bcontrol:\s*(\d+)', line)
        gm = re.search(r'\bgrit:\s*(\d+)', line)
        if vm:
            cur_vel = int(vm.group(1))
        if cm:
            cur_ctrl = int(cm.group(1))
        if gm:
            cur_grit = int(gm.group(1))

        # ── Fix 1: Hitter contact/power split ────────────────────────────────
        if not is_pitcher and cur_pos in POSITION_ADJUST:
            hpm = re.search(r'hitForAvg:\s*(\d+),\s*power:\s*(\d+)', line)
            if hpm:
                hit_val = int(hpm.group(1))
                pow_val = int(hpm.group(2))
                if hit_val == pow_val and hit_val > 65:
                    adj = POSITION_ADJUST[cur_pos]
                    new_hit = hit_val + adj['hit']
                    new_pow = pow_val + adj['power']
                    nl = nl.replace(
                        f'hitForAvg: {hit_val}, power: {pow_val}',
                        f'hitForAvg: {new_hit}, power: {new_pow}'
                    )
                    changes['hitter_splits'] += 1

        # ── Fix 2-6: Ability modifications ───────────────────────────────────
        ab_match = re.search(r'(abilities:\s*)(\[[^\]]*\])', nl)
        if ab_match:
            abilities = parse_abilities(ab_match.group(2))
            orig = list(abilities)

            # ── Remove Contact Hitter (from hitters with ≥2 abilities) ───────
            if (not is_pitcher and
                'Contact Hitter' in abilities and
                len(abilities) >= 2 and
                totals['Contact Hitter'] > LIMITS['Contact Hitter']):
                # Remove if Power Hitter (contradictory), ≥4 abilities, or ≥3 abilities
                if 'Power Hitter' in abilities or len(abilities) >= 3:
                    abilities.remove('Contact Hitter')
                    totals['Contact Hitter'] -= 1
                    changes['contact_hitter_removed'] += 1

            # ── Remove Guts (from pitchers with ≥2 abilities) ────────────────
            if (is_pitcher and
                'Guts' in abilities and
                len(abilities) >= 2 and
                totals['Guts'] > LIMITS['Guts']):
                # Remove if has Strong Starter (superior), Heavy Ball, or ≥3 abilities
                if 'Strong Starter' in abilities or 'Heavy Ball' in abilities or len(abilities) >= 3:
                    abilities.remove('Guts')
                    totals['Guts'] -= 1
                    changes['guts_removed'] += 1

            # ── Remove Sharpness (from pitchers with ≥3 abilities) ───────────
            if (is_pitcher and
                'Sharpness' in abilities and
                len(abilities) >= 3 and
                totals['Sharpness'] > LIMITS['Sharpness']):
                # Remove if still has Guts after potential Guts removal, or ≥4 abilities
                if 'Guts' in abilities or len(abilities) >= 4:
                    abilities.remove('Sharpness')
                    totals['Sharpness'] -= 1
                    changes['sharpness_removed'] += 1

            # ── Add Walk (to pitchers with vel≥65 ctrl≤65, ≤3 abilities) ─────
            if (is_pitcher and
                'Walk' not in abilities and
                totals['Walk'] < MINS['Walk'] and
                (cur_vel or 0) >= 65 and
                (cur_ctrl or 0) <= 65 and
                len(abilities) <= 3):
                abilities.append('Walk')
                totals['Walk'] += 1
                changes['walk_added'] += 1

            # ── Add Slow Starter (FR/SO pitchers ctrl<58, ≤2 abilities) ──────
            neg_combo = totals['Slow Starter'] + totals['Glass Heart']
            if (is_pitcher and
                'Slow Starter' not in abilities and
                cur_eli in ('FR', 'SO') and
                (cur_ctrl or 99) < 58 and
                neg_combo < MINS['neg_combo'] and
                totals['Slow Starter'] < 12 and
                len(abilities) <= 2):
                abilities.append('Slow Starter')
                totals['Slow Starter'] += 1
                changes['slow_starter_added'] += 1

            # ── Add Glass Heart (FR pitchers grit≤45, ≤2 abilities) ──────────
            neg_combo = totals['Slow Starter'] + totals['Glass Heart']
            if (is_pitcher and
                'Glass Heart' not in abilities and
                cur_eli == 'FR' and
                (cur_grit or 99) <= 45 and
                neg_combo < MINS['neg_combo'] and
                totals['Glass Heart'] < 10 and
                len(abilities) <= 2):
                abilities.append('Glass Heart')
                totals['Glass Heart'] += 1
                changes['glass_heart_added'] += 1

            if abilities != orig:
                new_ab_str = format_abilities(abilities)
                nl = nl.replace(ab_match.group(2), new_ab_str)

        new_lines.append(nl)

    new_content = ''.join(new_lines)
    with open(filepath) as f:
        orig_content = f.read()
    if new_content != orig_content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f'  Modified: {filepath}')

# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────
print('=== Roster Realism Fix Script ===')
print('Counting current ability totals...')
count_totals()
print(f'  Contact Hitter: {totals["Contact Hitter"]} (target <280)')
print(f'  Guts:           {totals["Guts"]} (target <220)')
print(f'  Sharpness:      {totals["Sharpness"]} (target <220)')
print(f'  Walk:           {totals["Walk"]} (target ≥25)')
print(f'  Slow Starter:   {totals["Slow Starter"]}')
print(f'  Glass Heart:    {totals["Glass Heart"]} (Slow Starter+Glass Heart target ≥20)')

print('\nProcessing roster files...')
for filepath in ROSTER_FILES:
    process_file(filepath)

print('\n=== Changes Made ===')
for k, v in changes.items():
    print(f'  {k}: {v}')

print('\n=== Final Totals ===')
ch_ok = totals["Contact Hitter"] < 280
gu_ok = totals["Guts"] < 220
sh_ok = totals["Sharpness"] < 220
wk_ok = totals["Walk"] >= 25
ng_ok = totals["Slow Starter"] + totals["Glass Heart"] >= 20
print(f'  Contact Hitter: {totals["Contact Hitter"]} ({"✅" if ch_ok else "❌"} target <280)')
print(f'  Guts:           {totals["Guts"]} ({"✅" if gu_ok else "❌"} target <220)')
print(f'  Sharpness:      {totals["Sharpness"]} ({"✅" if sh_ok else "❌"} target <220)')
print(f'  Walk:           {totals["Walk"]} ({"✅" if wk_ok else "❌"} target ≥25)')
print(f'  Slow Starter+Glass Heart: {totals["Slow Starter"]+totals["Glass Heart"]} ({"✅" if ng_ok else "❌"} target ≥20)')

all_ok = ch_ok and gu_ok and sh_ok and wk_ok and ng_ok
if not all_ok:
    print('\n❌ Some targets not met — may need additional passes or manual review')
    exit(1)
else:
    print('\n✅ All ability targets met')
