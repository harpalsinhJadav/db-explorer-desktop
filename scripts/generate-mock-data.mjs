/**
 * One-off generator for the mock JSON datasets used by schemaService.
 *
 * Run with:  node scripts/generate-mock-data.mjs
 *
 * It produces deterministic data (seeded RNG) so re-running gives stable files
 * and clean diffs. It writes to src/mock-data/<table>.json, matching the shape
 * declared in src/mock-data/schema.js.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'src', 'mock-data');
mkdirSync(outDir, { recursive: true });

// --- tiny seeded RNG (mulberry32) for deterministic output -----------------
let seed = 1337;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const money = (min, max) => Math.round((rand() * (max - min) + min) * 100) / 100;

const firstNames = ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy', 'Mallory', 'Niaj', 'Olivia', 'Peggy', 'Rupert', 'Sybil', 'Trent', 'Victor', 'Walter', 'Yara'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Lee'];
const productNames = ['Wireless Mouse', 'Mechanical Keyboard', 'USB-C Hub', '27" Monitor', 'Laptop Stand', 'Webcam HD', 'Noise-Cancel Headphones', 'Desk Lamp', 'Ergonomic Chair', 'Standing Desk', 'External SSD', 'Graphics Tablet', 'Bluetooth Speaker', 'Smartphone Dock', 'Power Bank', 'Cable Organizer', 'Microphone', 'Router', 'Network Switch', 'Docking Station'];
const categories = ['Peripherals', 'Displays', 'Accessories', 'Audio', 'Furniture', 'Storage', 'Networking'];
const orderStatuses = ['pending', 'shipped', 'delivered', 'cancelled', 'returned'];

// ISO timestamp / date helpers within 2023-2024.
function isoTimestamp() {
  const start = Date.UTC(2023, 0, 1);
  const end = Date.UTC(2024, 11, 31);
  return new Date(start + rand() * (end - start)).toISOString();
}
function isoDate() {
  return isoTimestamp().slice(0, 10);
}

const ROWS = 60; // >= 50 records per table

const customers = Array.from({ length: ROWS }, (_, i) => {
  const first = pick(firstNames);
  const last = pick(lastNames);
  return {
    id: i + 1,
    first_name: first,
    last_name: last,
    email: `${first.toLowerCase()}.${last.toLowerCase()}${i + 1}@example.com`,
    is_active: rand() > 0.3,
    created_at: isoTimestamp(),
  };
});

const products = Array.from({ length: ROWS }, (_, i) => ({
  id: i + 1,
  name: `${pick(productNames)} ${pick(['Pro', 'Lite', 'Max', 'Mini', 'Plus', 'X'])}`,
  category: pick(categories),
  price: money(9.99, 899.99),
  in_stock: rand() > 0.25,
  created_at: isoTimestamp(),
}));

const orders = Array.from({ length: ROWS }, (_, i) => {
  const qty = int(1, 12);
  const unit = money(9.99, 499.99);
  return {
    id: i + 1,
    customer_name: `${pick(firstNames)} ${pick(lastNames)}`,
    product_name: `${pick(productNames)} ${pick(['Pro', 'Lite', 'Max', 'Mini', 'Plus', 'X'])}`,
    quantity: qty,
    total: Math.round(qty * unit * 100) / 100,
    status: pick(orderStatuses),
    order_date: isoDate(),
  };
});

const datasets = { customers, products, orders };
for (const [name, rows] of Object.entries(datasets)) {
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(rows, null, 2) + '\n');
  console.log(`wrote ${rows.length} rows -> src/mock-data/${name}.json`);
}
