import { readFile } from 'node:fs/promises';

const file = process.argv[2];
if (!file) throw new Error('Pass an Appetize inspection JSON path.');
const root = JSON.parse(await readFile(file, 'utf8'));
const lines = ['## Appetize startup accessibility tree', '', 'Only visible labels and accessibility identifiers are included.'];
const seen = new Set();

function visit(value) {
  if (!value || typeof value !== 'object') return;
  const attributes = value.attributes && typeof value.attributes === 'object' ? value.attributes : {};
  const candidate = {
    id: attributes.testID ?? attributes.testId ?? attributes.identifier ?? value.testID ?? value.testId ?? value.identifier,
    label: attributes.accessibilityLabel ?? attributes.label ?? attributes.text ?? attributes.contentDescription
      ?? value.accessibilityLabel ?? value.label ?? value.text ?? value.contentDescription,
    role: attributes.accessibilityRole ?? attributes.role ?? value.accessibilityRole ?? value.role,
  };
  if (candidate.id || candidate.label || candidate.role) {
    const line = `- ${String(candidate.role ?? 'element')}: ${String(candidate.label ?? '').replace(/\s+/g, ' ').slice(0, 180)}${candidate.id ? ` [${String(candidate.id).slice(0, 120)}]` : ''}`;
    if (!seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(visit);
    else if (child && typeof child === 'object') visit(child);
  }
}

visit(root);
if (seen.size === 0) lines.push('- No accessibility labels were present in the inspection response.');
process.stdout.write(`${lines.join('\n')}\n`);

