const fs = require('node:fs');
const path = require('node:path');

const baselinePath = path.join(__dirname, '..', 'a11y-baseline.json');
const reportPath = process.argv[2];
if (!reportPath) {
  throw new Error('Usage: node check-a11y-baseline.js <lighthouse-report.json>');
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const score = report.categories?.accessibility?.score;
if (typeof score !== 'number') {
  throw new Error('Lighthouse report is missing its accessibility score');
}

console.log(
  `Lighthouse accessibility: ${score} (minimum ${baseline.minimumAccessibilityScore})`,
);
if (score < baseline.minimumAccessibilityScore) process.exit(1);
