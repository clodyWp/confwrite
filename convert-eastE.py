#!/usr/bin/env python3
import re
import sys

filepath = sys.argv[1]

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
result = []
for line in lines:
    # 一、二、三... -> ## 
    if re.match(r'^[一二三四五六七八九十]+、', line):
        result.append(f'## {line}')
    # （一）（二）... -> ###
    elif re.match(r'^（[一二三四五六七八九十]+）', line):
        result.append(f'### {line}')
    # 1. 2. 3. ... -> ####
    elif re.match(r'^\d+\.', line):
        result.append(f'#### {line}')
    else:
        result.append(line)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write('\n'.join(result))

print('Converted')
