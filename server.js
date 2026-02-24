const path = require('path');
const express = require('express');
const mysql = require('mysql2/promise');
require('dotenv').config();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || process.env.DB_PASS,
  database: process.env.DB_NAME || 'PhoneShop',
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0
});

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function parseJsonField(val, fallback = null) {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  return val;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function maybeNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return '';
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return value;
}

function normalizeProduct(row) {
  const colors = parseJsonField(row.colors, []);
  const features = parseJsonField(row.features, []);
  const specs = parseJsonField(row.specs, {});
  const tags = parseJsonField(row.tags, []);

  return {
    id: row.id,
    name: row.name,
    brand: row.brand || '',
    category: row.category || '',
    price: toNumber(row.price, 0),
    stock: toNumber(row.stock, 0),
    colors: Array.isArray(colors) ? colors : [],
    features: Array.isArray(features) ? features : [],
    specs: specs && typeof specs === 'object' ? specs : {},
    tags: Array.isArray(tags) ? tags : [],
    active: row.active === undefined ? true : Boolean(row.active),
    featured: row.featured === undefined ? false : Boolean(row.featured),
    release: row.release || '',
    notes: row.notes || '',
    created_at: row.created_at
  };
}

async function q(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

function isDuplicateColumnError(error) {
  return error && error.code === 'ER_DUP_FIELDNAME';
}

async function ensureProductsColumns() {
  const columns = await q(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'`
  );

  const existing = new Set(columns.map((c) => c.COLUMN_NAME));
  const missing = [];

  if (!existing.has('specs')) missing.push({ name: 'specs', ddl: 'ALTER TABLE products ADD COLUMN specs JSON NULL' });
  if (!existing.has('notes')) missing.push({ name: 'notes', ddl: 'ALTER TABLE products ADD COLUMN notes TEXT NULL' });

  for (const col of missing) {
    try {
      await q(col.ddl);
      console.log(`Added missing products.${col.name} column`);
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }
  }
}

function normalizeImageUrls(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item.url === 'string') return item.url.trim();
      return '';
    })
    .filter(Boolean);
}

function normalizeServices(services) {
  if (!services) return [];
  if (Array.isArray(services)) {
    return services
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const key = (entry.k || entry.key || '').toString().trim();
        const value = entry.v ?? entry.value;
        if (!key || value === undefined || value === null) return null;
        return { k: key, v: String(value) };
      })
      .filter(Boolean);
  }

  if (typeof services === 'object') {
    return Object.entries(services)
      .map(([k, v]) => {
        const key = String(k).trim();
        if (!key || v === undefined || v === null) return null;
        return { k: key, v: String(v) };
      })
      .filter(Boolean);
  }

  return [];
}

async function loadProductDetails(productId) {
  const imagesRows = await q('SELECT url FROM product_images WHERE product_id = ? ORDER BY id ASC', [productId]);
  const servicesRows = await q('SELECT k, v FROM product_services WHERE product_id = ? ORDER BY id ASC', [productId]);
  const reviewRows = await q(
    'SELECT id, name, rating, comment, created_at FROM product_reviews WHERE product_id = ? ORDER BY created_at DESC',
    [productId]
  );

  const services = {};
  for (const row of servicesRows) {
    if (row.k) services[row.k] = maybeNumber(row.v);
  }

  const reviews = reviewRows.map((row) => ({
    id: row.id,
    name: row.name,
    rating: toNumber(row.rating, 0),
    comment: row.comment || '',
    date: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    created_at: row.created_at
  }));

  return {
    images: imagesRows.map((row) => row.url),
    services,
    reviews
  };
}

async function hydrateProduct(row) {
  const base = normalizeProduct(row);
  const details = await loadProductDetails(base.id);
  return { ...base, ...details };
}

async function replaceProductImages(productId, images) {
  const urls = normalizeImageUrls(images);
  await q('DELETE FROM product_images WHERE product_id = ?', [productId]);
  for (const url of urls) {
    await q('INSERT INTO product_images (product_id, url) VALUES (?, ?)', [productId, url]);
  }
}

async function replaceProductServices(productId, services) {
  const entries = normalizeServices(services);
  await q('DELETE FROM product_services WHERE product_id = ?', [productId]);
  for (const entry of entries) {
    await q('INSERT INTO product_services (product_id, k, v) VALUES (?, ?, ?)', [productId, entry.k, entry.v]);
  }
}

async function healthHandler(_req, res) {
  try {
    await q('SELECT 1');
    res.type('text/plain').send('ok');
  } catch (error) {
    console.error('DB ping failed', error);
    res.status(500).type('text/plain').send('db error');
  }
}

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

app.get('/api/products', async (_req, res) => {
  try {
    const rows = await q('SELECT * FROM products ORDER BY created_at DESC');
    const products = await Promise.all(rows.map((row) => hydrateProduct(row)));
    res.json(products);
  } catch (error) {
    console.error('GET /api/products failed', error);
    res.status(500).json({ error: 'api error' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const rows = await q('SELECT * FROM products WHERE id = ?', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'not found' });
    const product = await hydrateProduct(rows[0]);
    res.json(product);
  } catch (error) {
    console.error(`GET /api/products/${id} failed`, error);
    res.status(500).json({ error: 'api error' });
  }
});

app.post('/api/products', async (req, res) => {
  const p = req.body || {};
  const id = (p.id || '').toString().trim();
  const name = (p.name || '').toString().trim();
  if (!id || !name) return res.status(400).json({ error: 'id and name are required' });

  try {
    const colors = JSON.stringify(normalizeArray(p.colors));
    const features = JSON.stringify(normalizeArray(p.features));
    const specs = JSON.stringify(p.specs && typeof p.specs === 'object' ? p.specs : {});
    const notes = p.notes || null;

    await q(
      `INSERT INTO products (id, name, brand, category, price, stock, colors, features, specs, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         brand = VALUES(brand),
         category = VALUES(category),
         price = VALUES(price),
         stock = VALUES(stock),
         colors = VALUES(colors),
         features = VALUES(features),
         specs = VALUES(specs),
         notes = VALUES(notes)`,
      [
        id,
        name,
        p.brand || null,
        p.category || null,
        toNumber(p.price, 0),
        toNumber(p.stock, 0),
        colors,
        features,
        specs,
        notes
      ]
    );

    await replaceProductImages(id, p.images);
    await replaceProductServices(id, p.services);

    res.status(201).json({ ok: true, id });
  } catch (error) {
    console.error('POST /api/products failed', error);
    res.status(500).json({ error: 'api error' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const p = req.body || {};

  try {
    const colors = JSON.stringify(normalizeArray(p.colors));
    const features = JSON.stringify(normalizeArray(p.features));
    const specs = JSON.stringify(p.specs && typeof p.specs === 'object' ? p.specs : {});
    const notes = p.notes || null;

    const result = await q(
      `UPDATE products
       SET name = ?, brand = ?, category = ?, price = ?, stock = ?, colors = ?, features = ?, specs = ?, notes = ?
       WHERE id = ?`,
      [
        p.name || null,
        p.brand || null,
        p.category || null,
        toNumber(p.price, 0),
        toNumber(p.stock, 0),
        colors,
        features,
        specs,
        notes,
        id
      ]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'not found' });

    await replaceProductImages(id, p.images);
    await replaceProductServices(id, p.services);

    res.json({ ok: true });
  } catch (error) {
    console.error(`PUT /api/products/${id} failed`, error);
    res.status(500).json({ error: 'api error' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await q('DELETE FROM products WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error(`DELETE /api/products/${id} failed`, error);
    res.status(500).json({ error: 'api error' });
  }
});

app.post('/api/products/:id/images', async (req, res) => {
  const { id } = req.params;
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const result = await q('INSERT INTO product_images (product_id, url) VALUES (?, ?)', [id, String(url)]);
    res.status(201).json({ ok: true, image_id: result.insertId });
  } catch (error) {
    console.error(`POST /api/products/${id}/images failed`, error);
    res.status(500).json({ error: 'api error' });
  }
});

app.delete('/api/products/:id/images/:imageId', async (req, res) => {
  const { id, imageId } = req.params;
  try {
    const result = await q('DELETE FROM product_images WHERE id = ? AND product_id = ?', [imageId, id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error(`DELETE /api/products/${id}/images/${imageId} failed`, error);
    res.status(500).json({ error: 'api error' });
  }
});

app.post('/api/products/:id/services', async (req, res) => {
  const { id } = req.params;
  const { k, v } = req.body || {};
  if (!k || v === undefined) return res.status(400).json({ error: 'k and v required' });
  try {
    const result = await q('INSERT INTO product_services (product_id, k, v) VALUES (?, ?, ?)', [id, String(k), String(v)]);
    res.status(201).json({ ok: true, service_id: result.insertId });
  } catch (error) {
    console.error(`POST /api/products/${id}/services failed`, error);
    res.status(500).json({ error: 'api error' });
  }
});

app.put('/api/products/:id/services/:serviceId', async (req, res) => {
  const { id, serviceId } = req.params;
  const { k, v } = req.body || {};
  try {
    const result = await q('UPDATE product_services SET k = ?, v = ? WHERE id = ? AND product_id = ?', [
      k || null,
      v !== undefined ? String(v) : null,
      serviceId,
      id
    ]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error(`PUT /api/products/${id}/services/${serviceId} failed`, error);
    res.status(500).json({ error: 'api error' });
  }
});

app.delete('/api/products/:id/services/:serviceId', async (req, res) => {
  const { id, serviceId } = req.params;
  try {
    const result = await q('DELETE FROM product_services WHERE id = ? AND product_id = ?', [serviceId, id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error(`DELETE /api/products/${id}/services/${serviceId} failed`, error);
    res.status(500).json({ error: 'api error' });
  }
});

app.post('/api/products/:id/reviews', async (req, res) => {
  const { id } = req.params;
  const { name, rating, comment } = req.body || {};
  if (!name || !rating) return res.status(400).json({ error: 'name and rating required' });
  try {
    const result = await q('INSERT INTO product_reviews (product_id, name, rating, comment) VALUES (?, ?, ?, ?)', [
      id,
      String(name),
      toNumber(rating, 0),
      comment || null
    ]);
    res.status(201).json({ ok: true, review_id: result.insertId });
  } catch (error) {
    console.error(`POST /api/products/${id}/reviews failed`, error);
    res.status(500).json({ error: 'api error' });
  }
});

app.delete('/api/products/:id/reviews/:reviewId', async (req, res) => {
  const { id, reviewId } = req.params;
  try {
    const result = await q('DELETE FROM product_reviews WHERE id = ? AND product_id = ?', [reviewId, id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (error) {
    console.error(`DELETE /api/products/${id}/reviews/${reviewId} failed`, error);
    res.status(500).json({ error: 'api error' });
  }
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error', err);
  res.status(500).json({ error: 'server error' });
});

async function start() {
  try {
    await ensureProductsColumns();
  } catch (error) {
    console.error('Failed to ensure products schema for specs/notes', error);
  }

  app.listen(PORT, HOST, () => {
    console.log(`PhoneShop listening on http://${HOST}:${PORT}`);
  });
}

start();
