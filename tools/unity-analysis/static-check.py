"""Syntax-only gate: does not import or execute any product/test module."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[2]
files=[p for folder in ['static-src/shared/unity-analysis','static-src/shared/compute','static-src/unity-analyzer','tools/unity-analysis'] for p in (root/folder).rglob('*.mjs') if '.build' not in p.parts]
for path in files:subprocess.run(['node','--check',str(path)],check=True,capture_output=True)
print(f'PASS syntax only: {len(files)} modules; no product execution')
