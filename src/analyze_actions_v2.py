import os
import re
import subprocess

actions_dir = r"c:\VamsiKrishna\Github\Tusker-managment\src\actions"
src_dir = r"c:\VamsiKrishna\Github\Tusker-managment\src"

# Regex for common export patterns in server actions
patterns = [
    r"export async function ([a-zA-Z0-9_]+)",
    r"export function ([a-zA-Z0-9_]+)",
    r"export const ([a-zA-Z0-9_]+) = (?:async )?\(",
]

all_exports = []

# 1. Collect all exported names from src/actions
for root, dirs, files in os.walk(actions_dir):
    if "__tests__" in root: continue
    for file in files:
        if file.endswith((".ts", ".tsx")):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                for p in patterns:
                    matches = re.findall(p, content)
                    for m in matches:
                        # Find the module name or just the function
                        all_exports.append({
                            "name": m,
                            "file": path.replace(actions_dir, "")
                        })

# 2. Check usage outside src/actions
# We use grep via subprocess if available, or just walk.
# Since we are on Windows and rg/grep might be missing, we'll use a python search.

def is_used(name, definition_file):
    # Search in src but exclude src/actions and the definition file itself
    count = 0
    for root, dirs, files in os.walk(src_dir):
        if "__tests__" in root: continue
        # We can search in actions too, but only to see if it's used by ANOTHER action
        # The user likely wants to know if they are and-points.
        # But let's check EVERYTHING in src except the file it is defined in.
        
        for file in files:
            if not file.endswith((".ts", ".tsx")): continue
            path = os.path.join(root, file)
            if path.endswith(definition_file): continue
            
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                # Use word boundaries to avoid partial matches
                if re.search(r'\b' + re.escape(name) + r'\b', f.read()):
                    count += 1
                    # Optimization: if found once outside actions, we can stop
                    if "src\\actions" not in root:
                        return True, count
    return count > 0, count

results = []
for export in all_exports:
    used, count = is_used(export["name"], export["file"])
    results.append({**export, "used": used, "count": count})

# 3. Print report
print(f"{'Status':<10} | {'Count':<6} | {'Function':<30} | {'File'}")
print("-" * 80)
unused_count = 0
for res in sorted(results, key=lambda x: x["used"]):
    status = "USED" if res["used"] else "UNUSED"
    if not res["used"]: unused_count += 1
    print(f"{status:<10} | {res['count']:<6} | {res['name']:<30} | {res['file']}")

print(f"\nTotal Unused Functions: {unused_count}")
