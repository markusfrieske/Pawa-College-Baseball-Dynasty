import re

def resolve_hbcu():
    with open('server/hbcuRosters.ts', 'r') as f:
        content = f.read()

    blocks = re.split(r'(<<<<<<< HEAD.*?>>>>>>> .*?\n)', content, flags=re.DOTALL)
    
    new_blocks = []
    for block in blocks:
        if block.startswith('<<<<<<< HEAD'):
            # Extract inline pitches from HEAD
            head_match = re.search(r'<<<<<<< HEAD\s+(.*?)\s+=======', block, re.DOTALL)
            # Extract new player from branch
            branch_match = re.search(r'=======\s+\.\.\.noPitches \},\s+(\{.*?)\s+\.\.\.noPitches \},?\s+>>>>>>>', block, re.DOTALL)
            
            if head_match and branch_match:
                inline_pitches = head_match.group(1).strip()
                new_player_body = branch_match.group(1).strip()
                resolved = f"{inline_pitches},\n    {new_player_body}\n      {inline_pitches}\n  ],"
                new_blocks.append(resolved)
            else:
                new_blocks.append(block)
        else:
            new_blocks.append(block)

    with open('server/hbcuRosters.ts', 'w') as f:
        f.write("".join(new_blocks))

resolve_hbcu()
