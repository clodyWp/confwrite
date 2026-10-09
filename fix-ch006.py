import json

# 读取项目状态
with open('/home/water/proj/c4/projects/LMERP2V2-new/project-state.json', 'r') as f:
    state = json.load(f)

# 更新 ch006 状态为 written
state['chapters']['ch006']['status'] = 'written'
state['chapters']['ch006']['version'] = 1

# 保存状态
with open('/home/water/proj/c4/projects/LMERP2V2-new/project-state.json', 'w') as f:
    json.dump(state, f, indent=2, ensure_ascii=False)

print("ch006 status updated to 'written'")
