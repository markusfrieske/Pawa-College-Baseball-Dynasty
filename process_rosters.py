import sys
import re

def calculate_ovr(p):
    # Special abilities bonus
    special_bonus = 0
    abilities = p.get('abilities', [])
    for a in abilities:
        if a in ["Explosive Fastball", "Perfect Combustion", "Big Boy Speed", "Monster Stuff", "Gas Tank", "Delayed Arm", "Gear Change", "Miracle Sharpness", "Sangfroid", "Wizard Mode", "Star of Victory", "Showtime", "Slugger Killer", "Precision Instrument", "Halting Quickness", "Iron Arm", "Fighting Spirit", "Top Gear", "Grit", "Doctor K", "Painter", "High Spin Gyroball", "Lefty Killer", "Cross Cannon", "Indomitable Soul", "Phantasmagoric", "Houdini", "Artist", "Hit Machine", "First Pitch King", "Ace Killer", "Surprise!", "Emergency Strength", "Outside Hitter", "Counterattack", "Spirit Head", "Bases Loaded King", "Shock Commander", "Heat Up", "Slap Happy", "Late Night Hero", "High Ball Hitter", "Express Baserunning", "High-Speed Laser", "Defensive Artisan", "Consigliere", "Golden Glove"]:
             special_bonus += 33
        elif a in ["Intimidator", "Heavy Ball", "Winner's Luck", "Pace", "Straddle", "Natural Shuuto", "True Slider", "Sharpness", "Fireman", "Constant Speed", "Crossfire", "Good Pickoff", "Guts", "Decisive", "Gyroball", "vs. Strong Batters", "Staredown", "Strong Starter", "Kageura", "Strong Finisher", "Quick Hands", "Strikeout", "Tunneling", "Inside Pitch", "Escape Pitch", "Low Ball", "Release", "Chance Maker", "Contact Hitter", "Power Hitter", "Tough Out", "Line Drive", "Full Throttle", "Pull Hitter", "Good Mood", "Iron Man", "Multi-Hit", "Trickster", "God of Pinch Hitting", "Good Bunt", "Unpredictable", "Walkoff Hitter", "Trash Talker"]:
             special_bonus += 20
        elif a in ["Unlucky Pitch", "Glass Heart", "Lightweight Ball", "Frozen", "Shuuto Spin", "Walk", "Slow Starter", "Poor Finisher", "Hot Head", "Cowardly", "Loser's Luck", "Confusion", "Strikeout Hitter", "Error Prone", "Slow Footed", "Cold Streak"]:
             special_bonus -= 15
    
    is_pitcher = p['position'] in ["P", "SP", "RP", "CP", "CL"]
    if is_pitcher:
        pitchCore = (p.get('velocity') or 0) + (p.get('control') or 0) + (p.get('stamina') or 0) + (p.get('stuff') or 0)
        pitchField = (p.get('arm') or 0) + (p.get('fielding') or 0)
        pitchCommon = (p.get('heater') or 0) + (p.get('poise') or 0) + (p.get('recovery') or 0) + (p.get('wRISP') or 0) + (p.get('vsLefty') or 0)
        raw = round(pitchCore * 0.85 + pitchField * 0.20 + pitchCommon * 0.25 + special_bonus)
        return max(150, min(650, raw))
    else:
        hitCore = (p.get('hitForAvg') or 0) + (p.get('power') or 0) + (p.get('speed') or 0) + (p.get('arm') or 0) + (p.get('fielding') or 0) + (p.get('errorResistance') or 0)
        hitCommon = (p.get('clutch') or 0) + (p.get('vsLHP') or 0) + (p.get('grit') or 0) + (p.get('stealing') or 0) + (p.get('running') or 0) + (p.get('throwing') or 0) + (p.get('agile') or 0) + (p.get('wRISP') or 0) + (p.get('vsLefty') or 0)
        raw = round(hitCore * 0.75 + hitCommon * 0.22 + special_bonus)
        return max(150, min(650, raw))

def parse_file(filename):
    with open(filename, 'r') as f:
        content = f.read()
    
    # Use regex to find player blocks
    players = []
    # This regex is a bit loose but should work for the JS objects
    # It looks for { firstName: ..., abilities: [...] }
    player_matches = re.finditer(r'\{[^{}]*?firstName:[^{}]*?\}', content, re.DOTALL)
    
    for match in player_matches:
        block = match.group(0)
        # Extract fields
        p = {}
        for field in ['firstName', 'lastName', 'position', 'eligibility']:
            m = re.search(rf'{field}:\s*["\']([^"\']+)["\']', block)
            if m: p[field] = m.group(1)
            
        for field in ['hitForAvg', 'power', 'speed', 'arm', 'fielding', 'errorResistance', 'velocity', 'control', 'stamina', 'stuff', 'clutch', 'vsLHP', 'grit', 'stealing', 'running', 'throwing', 'recovery', 'wRISP', 'vsLefty', 'poise', 'heater', 'agile']:
            m = re.search(rf'{field}:\s*(\d+)', block)
            if m: p[field] = int(m.group(1))
        
        m = re.search(r'abilities:\s*\[(.*?)\]', block)
        if m:
            p['abilities'] = [a.strip().strip('"').strip("'") for a in m.group(1).split(',') if a.strip()]
        else:
            p['abilities'] = []
            
        if p.get('firstName') and p.get('eligibility') in ['JR', 'SR']:
            p['ovr'] = calculate_ovr(p)
            players.append(p)
    return players

files = [
    'server/secBatch1.ts', 'server/secBatch2.ts', 'server/secBatch3.ts',
    'server/accRostersBatch1.ts', 'server/accRostersBatch2.ts', 'server/accRostersBatch3.ts',
    'server/bigTenBatch1.ts', 'server/bigTenBatch2.ts', 'server/bigTenBatch3.ts',
    'server/big12Rosters.ts'
]

results = []
for f in files:
    results.extend(parse_file(f))

# Print in a compact format for the report
for p in sorted(results, key=lambda x: x['ovr'], reverse=True)[:100]: # Top 100 or so to keep it manageable
    print(f"{p['firstName']} {p['lastName']} | {p['position']} | {p['eligibility']} | OVR: {p['ovr']} | Abilities: {p['abilities']}")
