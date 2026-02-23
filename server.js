// server.js — MariaDB fixed backend for PhoneShop
// Run with: node server.js
// Expects env: DB_HOST, DB_USER, DB_PASS, DB_NAME=PhoneShop, DB_PORT=3306, PORT=3000

const express = require('express');
const mariadb = require('mariadb');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME || 'PhoneShop',
  port: Number(process.env.DB_PORT || 3306),
  connectionLimit: 10
});

const app = express();
app.use(express.json({ limit: '1mb' }));

function parseJsonField(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return null; }
  }
  return val; // already object/array
}

function normalizeProduct(row) {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: row.category,
    price: Number(row.price ?? 0),
    stock: Number(row.stock ?? 0),
    colors: parseJsonField(row.colors),
    features: parseJsonField(row.features),
    created_at: row.created_at
  };
}

async function q(sql, params) {
  // Use pool.query for simplicity; returns array of rows or OkPacket
  return pool.query(sql, params);
}

// Health check (DB-aware). Nginx/ALB can proxy /health to this if you want API health.
app.get('/health', async (_req, res) => {
  try {
    await q('SELECT 1');
    res.type('text/plain').send('ok');
  } catch (e) {
    console.error('DB ping failed', e);
    res.status(500).type('text/plain').send('db error');
  }
});

// List products
app.get('/api/products', async (_req, res) => {
  try {
    const rows = await q('SELECT * FROM products ORDER BY created_at DESC');
    res.json(rows.map(normalizeProduct));
  } catch (e) {
    console.error('GET /api/products failed', e);
    res.status(500).json({ error: 'api error' });
  }
});

// Get one product with related data
app.get('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await q('SELECT * FROM products WHERE id = ?', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'not found' });
    const product = normalizeProduct(rows[0]);

    const images = await q('SELECT id, url FROM product_images WHERE product_id = ? ORDER BY id ASC', [id]);
    const services = await q('SELECT id, k, v FROM product_services WHERE product_id = ? ORDER BY id ASC', [id]);
    const reviews = await q('SELECT id, name, rating, comment, created_at FROM product_reviews WHERE product_id = ? ORDER BY created_at DESC', [id]);

    res.json({ ...product, images, services, reviews });
  } catch (e) {
    console.error(`GET /api/products/${id} failed`, e);
    res.status(500).json({ error: 'api error' });
  }
});

// Create/Upsert product
app.post('/api/products', async (req, res) => {
  const p = req.body || {};
  if (!p.id || !p.name) return res.status(400).json({ error: 'id and name are required' });
  try {
    const colors = p.colors ? JSON.stringify(p.colors) : null;
    const features = p.features ? JSON.stringify(p.features) : null;

    // Upsert to simplify admin edits
    await q(
      `INSERT INTO products (id, name, brand, category, price, stock, colors, features)
       VALUES (?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         name=VALUES(name),
         brand=VALUES(brand),
         category=VALUES(category),
         price=VALUES(price),
         stock=VALUES(stock),
         colors=VALUES(colors),
         features=VALUES(features)`,
      [p.id, p.name, p.brand || null, p.category || null, p.price ?? 0, p.stock ?? 0, colors, features]
    );
    res.status(201).json({ ok: true, id: p.id });
  } catch (e) {
    console.error('POST /api/products failed', e);
    res.status(500).json({ error: 'api error' });
  }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const p = req.body || {};
  try {
    const colors = p.colors ? JSON.stringify(p.colors) : null;
    const features = p.features ? JSON.stringify(p.features) : null;

    const result = await q(
      `UPDATE products
       SET name=?, brand=?, category=?, price=?, stock=?, colors=?, features=?
       WHERE id=?`,
      [p.name, p.brand || null, p.category || null, p.price ?? 0, p.stock ?? 0, colors, features, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error(`PUT /api/products/${id} failed`, e);
    res.status(500).json({ error: 'api error' });
  }
});

// Delete product (cascade removes related via FK)
app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await q('DELETE FROM products WHERE id=?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error(`DELETE /api/products/${id} failed`, e);
    res.status(500).json({ error: 'api error' });
  }
});

// Images
app.post('/api/products/:id/images', async (req, res) => {
  const { id } = req.params;
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const result = await q('INSERT INTO product_images (product_id, url) VALUES (?,?)', [id, url]);
    res.status(201).json({ ok: true, image_id: result.insertId });
  } catch (e) {
    console.error(`POST /api/products/${id}/images failed`, e);
    res.status(500).json({ error: 'api error' });
  }
});

app.delete('/api/products/:id/images/:imageId', async (req, res) => {
  const { id, imageId } = req.params;
  try {
    const result = await q('DELETE FROM product_images WHERE id=? AND product_id=?', [imageId, id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error(`DELETE /api/products/${id}/images/${imageId} failed`, e);
    res.status(500).json({ error: 'api error' });
  }
});

// Services (k/v)
app.post('/api/products/:id/services', async (req, res) => {
  const { id } = req.params;
  const { k, v } = req.body || {};
  if (!k || v === undefined) return res.status(400).json({ error: 'k and v required' });
  try {
    const result = await q('INSERT INTO product_services (product_id, k, v) VALUES (?,?,?)', [id, k, String(v)]);
    res.status(201).json({ ok: true, service_id: result.insertId });
  } catch (e) {
    console.error(`POST /api/products/${id}/services failed`, e);
    res.status(500).json({ error: 'api error' });
  }
});

app.put('/api/products/:id/services/:serviceId', async (req, res) => {
  const { id, serviceId } = req.params;
  const { k, v } = req.body || {};
  try {
    const result = await q('UPDATE product_services SET k=?, v=? WHERE id=? AND product_id=?', [k || null, v !== undefined ? String(v) : null, serviceId, id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error(`PUT /api/products/${id}/services/${serviceId} failed`, e);
    res.status(500).json({ error: 'api error' });
  }
});

app.delete('/api/products/:id/services/:serviceId', async (req, res) => {
  const { id, serviceId } = req.params;
  try {
    const result = await q('DELETE FROM product_services WHERE id=? AND product_id=?', [serviceId, id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error(`DELETE /api/products/${id}/services/${serviceId} failed`, e);
    res.status(500).json({ error: 'api error' });
  }
});

// Reviews
app.post('/api/products/:id/reviews', async (req, res) => {
  const { id } = req.params;
  const { name, rating, comment } = req.body || {};
  if (!name || !rating) return res.status(400).json({ error: 'name and rating required' });
  try {
    const result = await q(
      'INSERT INTO product_reviews (product_id, name, rating, comment) VALUES (?,?,?,?)',
      [id, name, Number(rating), comment || null]
    );
    res.status(201).json({ ok: true, review_id: result.insertId });
  } catch (e) {
    console.error(`POST /api/products/${id}/reviews failed`, e);
    res.status(500).json({ error: 'api error' });
  }
});

app.delete('/api/products/:id/reviews/:reviewId', async (req, res) => {
  const { id, reviewId } = req.params;
  try {
    const result = await q('DELETE FROM product_reviews WHERE id=? AND product_id=?', [reviewId, id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error(`DELETE /api/products/${id}/reviews/${reviewId} failed`, e);
    res.status(500).json({ error: 'api error' });
  }
});

// Global error handler (fallback)
app.use((err, _req, res, _next) => {
  console.error('Unhandled error', err);
  res.status(500).json({ error: 'server error' });
});

app.listen(PORT, HOST, () => {
  console.log(`API listening on ${PORT}`);
});
