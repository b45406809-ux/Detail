#!/usr/bin/env python3
"""Write a GitHub operations log with configured secret values redacted."""
import os
import re
import sys
from pathlib import Path

if len(sys.argv) != 3:
    raise SystemExit('Usage: redact_gha_ops_log.py INPUT OUTPUT')
source, destination = map(Path, sys.argv[1:])
text = source.read_text(encoding='utf-8', errors='replace') if source.exists() else 'No command output was produced.\n'
secrets = sorted(
    (value for name, value in os.environ.items()
     if any(marker in name.upper() for marker in ('TOKEN', 'PASSWORD', 'SECRET', '_KEY', '_SID')) and len(value) >= 4),
    key=len,
    reverse=True,
)
for secret in secrets:
    text = text.replace(secret, '[REDACTED]')
# Also mask common key/value lines in case a tool formats credentials instead of printing the exact value.
text = re.sub(r'(?im)^([^\n]*(?:service[_-]?role|secret|token|password|api[_-]?key|auth[_-]?token)[^\n]*[:=]\s*)\S+', r'\1[REDACTED]', text)
destination.write_text(text, encoding='utf-8')
