// Fills the local database with sample products and reviews.
// Usage: npm run db:seed            (only if there are no products yet)
//        npm run db:seed -- --reset (wipes orders, reviews and products first)
import { createClient } from "@libsql/client";

const db = createClient({ url: process.env.DATABASE_URL ?? "file:./data/local.db" });
const reset = process.argv.includes("--reset");

const products = [
  ["Honeycrisp Apples (3 lb bag)", "Sweet, crisp apples from Washington orchards.", "Orchard Valley", "produce", 599, 1, 40],
  ["Organic Bananas (bunch)", "About 6 bananas, ripen in 2-3 days.", "Green Field", "produce", 249, 1, 60],
  ["Hass Avocados (4 pack)", "Ready to eat within a few days.", "Sunrise Farms", "produce", 499, 0, 25],
  ["Organic Baby Spinach (5 oz)", "Triple washed and ready to use.", "Green Field", "produce", 399, 1, 30],
  ["Whole Milk (1 gal)", "Fresh pasteurized whole milk.", "Meadow Creek", "dairy", 429, 0, 20],
  ["Organic Greek Yogurt (32 oz)", "Plain, full fat, thick and tangy.", "Alpine Pastures", "dairy", 649, 1, 15],
  ["Aged Cheddar (8 oz)", "Sharp white cheddar aged 12 months.", "Meadow Creek", "dairy", 549, 0, 18],
  ["Sourdough Loaf", "Baked fresh each morning with a long ferment.", "Corner Bakery", "bakery", 699, 0, 12],
  ["Organic Whole Wheat Bread", "Sliced sandwich loaf, no added sugar.", "Corner Bakery", "bakery", 479, 1, 14],
  ["Free Range Eggs (dozen)", "Large brown eggs from pasture-raised hens.", "Sunrise Farms", "dairy", 579, 0, 35],
  ["Organic Rolled Oats (42 oz)", "Old fashioned oats for oatmeal and baking.", "Prairie Mills", "pantry", 549, 1, 22],
  ["Extra Virgin Olive Oil (500 ml)", "Cold pressed, from Spain.", "Costa Verde", "pantry", 1199, 0, 16],
  ["Organic Peanut Butter (16 oz)", "Just peanuts and a pinch of salt.", "Prairie Mills", "pantry", 649, 1, 0],
  ["Dark Roast Coffee Beans (12 oz)", "Notes of chocolate and toasted nuts.", "Night Owl Roasters", "pantry", 1399, 0, 10],
];

const reviews = {
  "Honeycrisp Apples (3 lb bag)": [["Maya", 5, "Super crisp", "Best apples I've had all year.", 1], ["Jordan", 4, null, "Great flavor, a couple were bruised.", 1]],
  "Organic Bananas (bunch)": [["Priya", 4, null, "Arrived green but ripened nicely.", 1]],
  "Hass Avocados (4 pack)": [["Leo", 3, "Hit or miss", "Two were perfect, two were stringy.", 0], ["Sam", 4, null, "Good for the price.", 1]],
  "Organic Greek Yogurt (32 oz)": [["Ana", 5, "So thick", "Tastes like the real thing from Greece.", 1]],
  "Sourdough Loaf": [["Chris", 5, "Proper sourdough", "Great crust, nice and sour.", 1], ["Maya", 5, null, "We buy two a week now.", 1]],
  "Free Range Eggs (dozen)": [["Jordan", 4, null, "Deep orange yolks.", 1]],
  "Extra Virgin Olive Oil (500 ml)": [["Priya", 5, "Peppery and fresh", "Worth the price for salads.", 0]],
  "Dark Roast Coffee Beans (12 oz)": [["Leo", 2, "Too bitter", "Not for me, very burnt taste.", 1], ["Ana", 4, null, "Great as espresso.", 1]],
};

const { rows } = await db.execute("SELECT count(*) AS n FROM products");
if (rows[0].n > 0 && !reset) {
  console.log(`Database already has ${rows[0].n} products. Run with --reset to start over.`);
  process.exit(0);
}

if (reset) {
  await db.batch(["DELETE FROM order_items", "DELETE FROM orders", "DELETE FROM reviews", "DELETE FROM products"], "write");
}

for (const [name, description, brand, category, priceCents, isOrganic, stock] of products) {
  const { rows: inserted } = await db.execute({
    sql: `INSERT INTO products (name, description, brand, category, price_cents, is_organic, stock_quantity)
          VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    args: [name, description, brand, category, priceCents, isOrganic, stock],
  });
  const productId = inserted[0].id;

  const list = reviews[name] ?? [];
  for (const [reviewerName, rating, title, comment, verified] of list) {
    await db.execute({
      sql: `INSERT INTO reviews (product_id, reviewer_name, rating, title, comment, is_verified_purchase)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [productId, reviewerName, rating, title, comment, verified],
    });
  }
  if (list.length) {
    const avg = Math.round((list.reduce((s, r) => s + r[1], 0) / list.length) * 10) / 10;
    await db.execute({ sql: "UPDATE products SET rating = ? WHERE id = ?", args: [avg, productId] });
  }
}

console.log(`Seeded ${products.length} products and ${Object.values(reviews).flat().length} reviews.`);
