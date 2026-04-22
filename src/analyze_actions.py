import os
import subprocess
import re

actions_dir = r"c:\VamsiKrishna\Github\Tusker-managment\src\actions"
src_dir = r"c:\VamsiKrishna\Github\Tusker-managment\src"

pattern1 = r"export async function ([a-zA-Z0-9]+)"
pattern2 = r"export const ([a-zA-Z0-9]+) = (async )?\("

action_names = []

for root, dirs, files in os.walk(actions_dir):
    for file in files:
        if file.endswith(".ts") or file.endswith(".tsx"):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                matches1 = re.findall(pattern1, content)
                matches2 = re.findall(pattern2, content)
                action_names.extend(matches1)
                action_names.extend([m[0] for m in matches2])

action_names = sorted(list(set(action_names)))

results = []

for name in action_names:
    # Use grep to find occurrences in src, excluding src/actions/ and tests
    try:
        # On Windows, using findstr might be slow, let's try calling a subprocess with a simple search
        # or just use the agent's grep tool in a loop (but that's many calls).
        # Better: run a powershell command that does strings and selection
        
        # We search in src, but exclude src/actions
        # We also need to ignore the definition line itself.
        
        ps_cmd = f'Get-ChildItem -Path "{src_dir}" -Recurse -File -Include *.ts,*.tsx | Select-String -Pattern "{name}" -CaseSensitive'
        output = subprocess.check_output(['powershell', '-Command', ps_cmd], text=True, errors='ignore')
        
        # Filter out results from actions directory
        lines = [line for line in output.splitlines() if "src\\actions" not in line and "__tests__" not in line]
        
        if not lines:
            results.append(f"[UNUSED] {name}")
        else:
            results.append(f"[USED]   {name} ({len(lines)} occurrences)")
            
    except subprocess.CalledProcessError:
        results.append(f"[UNUSED] {name} (Error or No Match)")

with open(r"c:\VamsiKrishna\Github\Tusker-managment\src\actions_usage_report.txt", 'w', encoding='utf-8') as f:
    for res in results:
        f.write(res + "\n")

print("Report generated in src/actions_usage_report.txt")
