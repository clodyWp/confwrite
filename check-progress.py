import json
import sys

with open('/home/water/proj/c4/projects/LMERP2V2-new/project-state.json', 'r') as f:
    d = json.load(f)

print(f"Phase: {d['currentPhase']}")
print(f"Status: {d['status']}")
chapters = d['chapters']
total = len(chapters)
written = sum(1 for c in chapters.values() if c['status'] == 'written')
writing = sum(1 for c in chapters.values() if c['status'] == 'writing')
pending = sum(1 for c in chapters.values() if c['status'] == 'pending')
print(f"Chapters: {written} written, {writing} writing, {pending} pending, {total} total")
