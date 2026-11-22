// Fills the local database with mock products, reviews and orders.
// Usage: npm run db:seed            (only if there are no products yet)
//        npm run db:seed -- --reset (wipes orders, reviews and products first)
//
// The data is generated from a fixed seed, so every run produces the same store.
import { createClient } from "@libsql/client";

const db = createClient({ url: process.env.DATABASE_URL ?? "file:./data/local.db" });
const reset = process.argv.includes("--reset");

// Small seeded random generator (mulberry32) so runs are repeatable.
let state = 20261121;
function rand() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));

const DAY = 86400;
const now = Math.floor(Date.now() / 1000);
const daysAgo = (d) => now - d * DAY - int(0, DAY - 1);

// name, description, brand, category, price in cents, organic, stock, quality.
// quality (1-5) steers how good its reviews are.
const products = [
  // produce
  ["Honeycrisp Apples (3 lb bag)", "Sweet, crisp apples from Washington orchards.", "Orchard Valley", "produce", 599, 0, 40, 4.6],
  ["Organic Bananas (bunch)", "About 6 bananas, ripen in 2-3 days.", "Green Field", "produce", 249, 1, 60, 4.2],
  ["Hass Avocados (4 pack)", "Ready to eat within a few days.", "Sunrise Farms", "produce", 499, 0, 25, 3.4],
  ["Organic Baby Spinach (5 oz)", "Triple washed and ready to use.", "Green Field", "produce", 399, 1, 30, 4.1],
  ["Organic Strawberries (1 lb)", "Picked ripe, best eaten within two days.", "Coastal Berry Co.", "produce", 549, 1, 18, 3.9],
  ["Blueberries (pint)", "Plump and sweet, great for breakfast.", "Coastal Berry Co.", "produce", 449, 0, 22, 4.3],
  ["Organic Carrots (2 lb)", "Crunchy and sweet, with the dirt washed off.", "Green Field", "produce", 279, 1, 45, 4.4],
  ["Yellow Onions (3 lb)", "Everyday cooking onions.", "Sunrise Farms", "produce", 329, 0, 50, 4.0],
  ["Roma Tomatoes (1 lb)", "Meaty tomatoes for sauces and salads.", "Sunrise Farms", "produce", 249, 0, 35, 3.6],
  ["Organic Lemons (2 lb bag)", "Juicy, thin skinned lemons.", "Orchard Valley", "produce", 499, 1, 0, 4.2],
  ["Sweet Potatoes (3 lb)", "Orange flesh, great roasted.", "Prairie Roots", "produce", 399, 0, 28, 4.5],
  ["Organic Kale (bunch)", "Curly kale for salads and smoothies.", "Green Field", "produce", 299, 1, 20, 3.8],

  // dairy & eggs
  ["Whole Milk (1 gal)", "Fresh pasteurized whole milk.", "Meadow Creek", "dairy", 429, 0, 20, 4.3],
  ["Organic 2% Milk (half gal)", "From grass fed cows.", "Alpine Pastures", "dairy", 449, 1, 24, 4.5],
  ["Organic Greek Yogurt (32 oz)", "Plain, full fat, thick and tangy.", "Alpine Pastures", "dairy", 649, 1, 15, 4.8],
  ["Aged Cheddar (8 oz)", "Sharp white cheddar aged 12 months.", "Meadow Creek", "dairy", 549, 0, 18, 4.6],
  ["Fresh Mozzarella (8 oz)", "Soft, milky and best within a week.", "Bella Latte", "dairy", 499, 0, 12, 4.1],
  ["Salted Butter (1 lb)", "Four sticks of creamy salted butter.", "Meadow Creek", "dairy", 579, 0, 30, 4.4],
  ["Free Range Eggs (dozen)", "Large brown eggs from pasture-raised hens.", "Sunrise Farms", "dairy", 579, 0, 35, 4.5],
  ["Oat Milk (64 oz)", "Creamy, barista style, no added sugar.", "Oatly Fields", "dairy", 499, 0, 26, 4.0],

  // bakery
  ["Sourdough Loaf", "Baked fresh each morning with a long ferment.", "Corner Bakery", "bakery", 699, 0, 12, 4.9],
  ["Organic Whole Wheat Bread", "Sliced sandwich loaf, no added sugar.", "Corner Bakery", "bakery", 479, 1, 14, 3.9],
  ["Butter Croissants (4 pack)", "Flaky, all butter croissants.", "Corner Bakery", "bakery", 799, 0, 8, 4.7],
  ["Everything Bagels (6 pack)", "Chewy bagels with sesame, poppy and garlic.", "Hudson Bagel Co.", "bakery", 549, 0, 16, 4.2],
  ["Gluten Free Sandwich Bread", "Soft enough for sandwiches, really.", "Pure Grain", "bakery", 699, 0, 10, 3.1],

  // pantry
  ["Organic Rolled Oats (42 oz)", "Old fashioned oats for oatmeal and baking.", "Prairie Mills", "pantry", 549, 1, 22, 4.6],
  ["Extra Virgin Olive Oil (500 ml)", "Cold pressed, from Spain.", "Costa Verde", "pantry", 1199, 0, 16, 4.7],
  ["Organic Peanut Butter (16 oz)", "Just peanuts and a pinch of salt.", "Prairie Mills", "pantry", 649, 1, 0, 4.4],
  ["Basmati Rice (5 lb)", "Long grain, aged for a fluffy texture.", "Royal Harvest", "pantry", 999, 0, 20, 4.5],
  ["Organic Black Beans (15 oz can)", "Low sodium, ready to heat.", "Green Field", "pantry", 179, 1, 60, 4.1],
  ["Spaghetti (1 lb)", "Bronze cut pasta from Italy.", "Nonna's Table", "pantry", 299, 0, 40, 4.4],
  ["Marinara Sauce (24 oz)", "Slow simmered tomatoes, garlic and basil.", "Nonna's Table", "pantry", 649, 0, 18, 4.0],
  ["Raw Honey (16 oz)", "Unfiltered wildflower honey.", "Busy Bee Apiary", "pantry", 899, 0, 14, 4.8],
  ["Organic Maple Syrup (12 oz)", "Grade A dark, from Vermont.", "Green Mountain", "pantry", 1299, 1, 9, 4.9],

  // snacks
  ["Sea Salt Potato Chips (8 oz)", "Kettle cooked, extra crunchy.", "Crisp & Co.", "snacks", 449, 0, 30, 4.2],
  ["Organic Tortilla Chips (12 oz)", "Stone ground corn, lightly salted.", "Green Field", "snacks", 399, 1, 25, 4.0],
  ["Dark Chocolate Bar 72%", "Fair trade cacao, a little fruity.", "Cocoa Republic", "snacks", 349, 0, 40, 4.7],
  ["Trail Mix (16 oz)", "Almonds, cashews, raisins and chocolate chips.", "Trailhead", "snacks", 799, 0, 15, 3.7],
  ["Organic Popcorn Kernels (2 lb)", "Pops big and fluffy.", "Prairie Mills", "snacks", 499, 1, 12, 4.3],

  // beverages
  ["Dark Roast Coffee Beans (12 oz)", "Notes of chocolate and toasted nuts.", "Night Owl Roasters", "beverages", 1399, 0, 10, 3.2],
  ["Organic Green Tea (20 bags)", "Light and grassy Japanese sencha.", "Leaf & Kettle", "beverages", 549, 1, 20, 4.3],
  ["Sparkling Water (12 pack)", "Lime flavored, no sweeteners.", "Clear Springs", "beverages", 599, 0, 30, 4.1],
  ["Cold Pressed Orange Juice (52 oz)", "Never from concentrate.", "Sunny Grove", "beverages", 699, 0, 0, 4.6],

  // frozen
  ["Frozen Organic Blueberries (3 lb)", "Wild blueberries, great for smoothies.", "Coastal Berry Co.", "frozen", 1099, 1, 14, 4.7],
  ["Margherita Pizza (frozen)", "Thin crust with mozzarella and basil.", "Nonna's Table", "frozen", 849, 0, 18, 3.5],
  ["Vanilla Bean Ice Cream (1.5 qt)", "Real vanilla, made with cream.", "Meadow Creek", "frozen", 699, 0, 11, 4.8],
];

const reviewers = [
  "Maya Patel", "Jordan Kim", "Priya Shah", "Leo Martins", "Sam Lee", "Ana Gomez",
  "Chris Wong", "Taylor Brooks", "Noah Fischer", "Emma Rossi", "Omar Haddad", "Grace Liu",
  "Ben Carter", "Sofia Nguyen", "Ravi Iyer", "Hannah Cole", "Diego Alvarez", "Mei Tanaka",
];

// What people say at each star rating. A few are product agnostic on purpose,
// the way real reviews often are.
const lines = {
  5: [
    ["Love it", "Exactly what I hoped for. Will buy again."],
    ["Best I've had", "Noticeably better than what I get at the supermarket."],
    ["Five stars", "Fresh, well packed and arrived on time."],
    [null, "My kids finished it in two days."],
    ["Staple in our house", "We order this every week now."],
  ],
  4: [
    ["Really good", "Very happy with it. Just a little pricey."],
    [null, "Good quality, would buy again."],
    ["Solid", "Does the job well. Packaging could be better."],
    ["Nice", "Tastes great, one item was a bit bruised."],
  ],
  3: [
    ["It's fine", "Nothing special, but nothing wrong with it either."],
    ["Hit or miss", "Some were great, some weren't."],
    [null, "Okay for the price. Probably won't reorder."],
  ],
  2: [
    ["Disappointed", "Didn't taste as fresh as I expected."],
    [null, "Arrived damaged and was hard to use."],
  ],
  1: [
    ["Not for me", "Threw most of it away. Would not buy again."],
  ],
};

function ratingFor(quality) {
  // Mostly near the product's quality, with the occasional outlier.
  const r = Math.round(quality + (rand() - 0.5) * 2.2);
  return Math.min(5, Math.max(1, r));
}

const customers = [
  ["Maya Patel", "maya.patel@example.com", "214 Oak Street, Portland, OR 97205"],
  ["Jordan Kim", "jordan.kim@example.com", "88 Lakeview Ave, Apt 4B, Chicago, IL 60614"],
  ["Priya Shah", "priya.shah@example.com", "1550 Mission St, San Francisco, CA 94103"],
  ["Leo Martins", "leo.martins@example.com", "9 Harbor Rd, Boston, MA 02110"],
  ["Ana Gomez", "ana.gomez@example.com", "3021 Elm Dr, Austin, TX 78704"],
  ["Sam Lee", "sam.lee@example.com", "1 Main St, Springfield, IL 62701"],
];

// Cycle through statuses so every one shows up, and pick an order date that
// fits it: pending orders are from today, delivered ones are weeks old.
const STATUS_CYCLE = ["pending", "paid", "shipped", "delivered", "delivered", "cancelled"];
const AGE_RANGE = {
  pending: [0, 1],
  paid: [1, 3],
  shipped: [3, 7],
  delivered: [8, 30],
  cancelled: [2, 20],
};

const { rows } = await db.execute("SELECT count(*) AS n FROM products");
if (rows[0].n > 0 && !reset) {
  console.log(`Database already has ${rows[0].n} products. Run with --reset to start over.`);
  process.exit(0);
}

const statements = [];
if (reset) {
  statements.push(
    "DELETE FROM order_items",
    "DELETE FROM orders",
    "DELETE FROM reviews",
    "DELETE FROM products",
    // Start ids from 1 again so the mock data looks the same every time.
    "DELETE FROM sqlite_sequence WHERE name IN ('products', 'reviews', 'orders', 'order_items')",
  );
}

let reviewCount = 0;
products.forEach(([name, description, brand, category, priceCents, isOrganic, stock, quality], i) => {
  const productId = i + 1;
  const created = daysAgo(int(60, 120));
  statements.push({
    sql: `INSERT INTO products (id, name, description, brand, category, price_cents, is_organic, stock_quantity, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [productId, name, description, brand, category, priceCents, isOrganic, stock, created, created],
  });

  const ratings = [];
  const people = [...reviewers].sort(() => rand() - 0.5).slice(0, int(0, 6));
  for (const person of people) {
    const rating = ratingFor(quality);
    const [title, comment] = pick(lines[rating]);
    ratings.push(rating);
    statements.push({
      sql: `INSERT INTO reviews (product_id, reviewer_name, rating, title, comment, is_verified_purchase, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [productId, person, rating, title, comment, rand() < 0.75 ? 1 : 0, daysAgo(int(1, 55))],
    });
  }
  reviewCount += ratings.length;

  if (ratings.length) {
    const avg = Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10;
    statements.push({ sql: "UPDATE products SET rating = ? WHERE id = ?", args: [avg, productId] });
  }
});

// Orders keep the price and name at the time of purchase, like real ones do.
const orderCount = 18;
const counts = {};
for (let orderId = 1; orderId <= orderCount; orderId++) {
  const customerIndex = (orderId - 1) % customers.length;
  const round = Math.floor((orderId - 1) / customers.length);
  const [customerName, customerEmail, shippingAddress] = customers[customerIndex];
  // Shift the cycle each round so a customer's orders don't all share a status.
  const status = STATUS_CYCLE[(customerIndex + round * 2) % STATUS_CYCLE.length];
  const age = int(...AGE_RANGE[status]);
  counts[status] = (counts[status] ?? 0) + 1;
  const placed = daysAgo(age);

  const chosen = [...products.keys()].sort(() => rand() - 0.5).slice(0, int(1, 5));
  const items = chosen.map((index) => ({
    productId: index + 1,
    name: products[index][0],
    price: products[index][4],
    quantity: int(1, 3),
  }));
  const total = items.reduce((s, it) => s + it.price * it.quantity, 0);

  statements.push({
    sql: `INSERT INTO orders (id, customer_name, customer_email, shipping_address, status, total_cents, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [orderId, customerName, customerEmail, shippingAddress, status, total, placed, placed + int(0, age) * DAY],
  });
  for (const it of items) {
    statements.push({
      sql: `INSERT INTO order_items (order_id, product_id, product_name, unit_price_cents, quantity) VALUES (?, ?, ?, ?, ?)`,
      args: [orderId, it.productId, it.name, it.price, it.quantity],
    });
  }
}

// One batch means one transaction: either all of it goes in or none of it does.
await db.batch(statements, "write");

const byCategory = products.reduce((m, p) => ((m[p[3]] = (m[p[3]] ?? 0) + 1), m), {});
console.log(`Seeded ${products.length} products, ${reviewCount} reviews and ${orderCount} orders.`);
console.log("  products by category:", Object.entries(byCategory).map(([k, v]) => `${k} ${v}`).join(", "));
console.log("  orders by status:    ", Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", "));
console.log("  customers:           ", customers.map((c) => c[1]).join(", "));
