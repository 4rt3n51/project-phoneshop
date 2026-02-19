// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const pool = require('./db');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(cors());

// Serve static frontend if desired
app.use('/', express.static(path.join(__dirname, 'public')));

// Health endpoint (ALB target group should use this)
app.get('/api/health', async (_req, res) => {
  try {
    // quick DB ping; a failure here will mark instance unhealthy
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    return res.json({ ok: true, ts: Date.now() });
  } catch (err) {
    console.error('DB ping failed', err);
    return res.status(500).json({ ok: false, error: 'db' });
  }
});

/**
Schema overview (infra/schema.sql):
- products (id, name, brand, category, price, stock, colors JSON, features JSON, created_at)
- product_images (id, product_id, url)
- product_services (id, product_id, k, v)
- product_reviews (id, product_id, name, rating, comment, created_at)
*/

// Helpers
async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// GET /api/products
app.get('/api/products', async (_req, res) => {
  try {
    const products = await query('SELECT * FROM products ORDER BY created_at DESC');
    // load related data
    const ids = products.map(p => p.id);
    let images = [];
    let services = [];
    let reviews = [];
    if (ids.length) {
      images = await query('SELECT * FROM product_images WHERE product_id IN (?)', [ids]);
      services = await query('SELECT * FROM product_services WHERE product_id IN (?)', [ids]);
      reviews = await query('SELECT * FROM product_reviews WHERE product_id IN (?) ORDER BY created_at DESC', [ids]);
    }
    const map = {};
    products.forEach(p => {
      map[p.id] = {
        ...p,
        colors: p.colors ? JSON.parse(p.colors) : [],
        features: p.features ? JSON.parse(p.features) : [],
        images: [],
        services: {},
        reviews: []
      };
    });
    images.forEach(i => map[i.product_id] && map[i.product_id].images.push(i.url));
    services.forEach(s => map[s.product_id] && (map[s.product_id].services[s.k] = s.v));
    reviews.forEach(r => map[r.product_id] && map[r.product_id].reviews.push(r));
    res.json(Object.values(map));
  } catch (err) {
    console.error('GET /api/products failed', err);
    res.status(500).json({ error: err.message });
  }
});

// GET single product
app.get('/api/products/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const rows = await query('SELECT * FROM products WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const p = rows[0];
    const images = await query('SELECT url FROM product_images WHERE product_id = ?', [id]);
    const services = await query('SELECT k, v FROM product_services WHERE product_id = ?', [id]);
    const reviews = await query('SELECT id, name, rating, comment, created_at FROM product_reviews WHERE product_id = ? ORDER BY created_at DESC', [id]);

    const product = {
      ...p,
      colors: p.colors ? JSON.parse(p.colors) : [],
      features: p.features ? JSON.parse(p.features) : [],
      images: images.map(r => r.url),
      services: Object.fromEntries(services.map(s => [s.k, s.v])),
      reviews
    };
    res.json(product);
  } catch (err) {
    console.error('GET /api/products/:id failed', err);
    res.status(500).json({ error: err.message });
  }
});

// POST create product
app.post('/api/products', async (req, res) => {
  const p = req.body;
  if (!p || !p.id || !p.name) return res.status(400).json({ error: 'id & name required' });
  try {
    await query(
      `INSERT INTO products (id, name, brand, category, price, stock, colors, features)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.id, p.name, p.brand || '', p.category || '', p.price || 0, p.stock || 0, JSON.stringify(p.colors || []), JSON.stringify(p.features || [])]
    );
    if (Array.isArray(p.images)) {
      for (const url of p.images) {
        await query('INSERT INTO product_images (product_id, url) VALUES (?, ?)', [p.id, url]);
      }
    }
    if (p.services) {
      for (const k of Object.keys(p.services)) {
        await query('INSERT INTO product_services (product_id, k, v) VALUES (?, ?, ?)', [p.id, k, p.services[k]]);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/products failed', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update product (simple replace for images/services)
app.put('/api/products/:id', async (req, res) => {
  const id = req.params.id;
  const p = req.body;
  try {
    await query(
      `UPDATE products SET name=?, brand=?, category=?, price=?, stock=?, colors=?, features=? WHERE id = ?`,
      [p.name, p.brand || '', p.category || '', p.price || 0, p.stock || 0, JSON.stringify(p.colors || []), JSON.stringify(p.features || []), id]
    );
    await query('DELETE FROM product_images WHERE product_id = ?', [id]);
    await query('DELETE FROM product_services WHERE product_id = ?', [id]);

    if (Array.isArray(p.images)) {
      for (const url of p.images) {
        await query('INSERT INTO product_images (product_id, url) VALUES (?, ?)', [id, url]);
      }
    }
    if (p.services) {
      for (const k of Object.keys(p.services)) {
        await query('INSERT INTO product_services (product_id, k, v) VALUES (?, ?, ?)', [id, k, p.services[k]]);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/products failed', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE product
app.delete('/api/products/:id', async (req, res) => {
  const id = req.params.id;
  try {
    await query('DELETE FROM product_reviews WHERE product_id = ?', [id]);
    await query('DELETE FROM product_images WHERE product_id = ?', [id]);
    await query('DELETE FROM product_services WHERE product_id = ?', [id]);
    await query('DELETE FROM products WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/products failed', err);
    res.status(500).json({ error: err.message });
  }
});

// POST review
app.post('/api/products/:id/reviews', async (req, res) => {
  const id = req.params.id;
  const { name, rating, comment } = req.body;
  if (!comment || !rating) return res.status(400).json({ error: 'rating & comment required' });
  try {
    const rows = await query('SELECT id FROM products WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    await query('INSERT INTO product_reviews (product_id, name, rating, comment) VALUES (?, ?, ?, ?)', [id, name || 'Anonymous', rating, comment]);
    res.json({ ok: true });
  } catch (err) {
    console.error('POST review failed', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API listening on ${PORT}`));
