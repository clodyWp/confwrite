import json
import sys

with open('/home/water/proj/c4/projects/LMERP2V2-new/project-state.json', 'r') as f:
    d = json.load(f)

print("ch006 status:", json.dumps(d['chapters']['ch006'], indent=2, ensure_ascii=False))
