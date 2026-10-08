const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) console.error('Gagal terhubung ke database:', err.message);
  else console.log('Terhubung ke database SQLite.');
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS cards (
      card_id TEXT PRIMARY KEY,
      pin_default TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      place_id TEXT,
      review_url TEXT,
      activated_at TEXT
    )
  `);
});

app.get('/card/:card_id', (req, res) => {
  const cardId = req.params.card_id.toUpperCase();
  db.get('SELECT * FROM cards WHERE card_id = ?', [cardId], (err, row) => {
    if (err) return res.status(500).send('Terjadi kesalahan server.');
    if (!row) return res.status(404).send('<h1>Kartu Tidak Terdaftar</h1>');
    if (row.is_active === 1) return res.redirect(row.review_url);
    res.redirect(`/activate.html?card_id=${cardId}`);
  });
});

app.get('/api/card-status/:card_id', (req, res) => {
  const cardId = req.params.card_id.toUpperCase();
  db.get('SELECT card_id, is_active FROM cards WHERE card_id = ?', [cardId], (err, row) => {
    if (err || !row) return res.json({ success: false, message: 'Kartu tidak ditemukan.' });
    res.json({ success: true, card_id: row.card_id, is_active: Boolean(row.is_active) });
  });
});

app.post('/api/activate', (req, res) => {
  const { card_id, pin, place_id } = req.body;
  if (!card_id || !pin || !place_id) return res.json({ success: false, message: 'Semua kolom wajib diisi!' });
  const cleanCardId = card_id.trim().toUpperCase();

  db.get('SELECT * FROM cards WHERE card_id = ?', [cleanCardId], (err, row) => {
    if (err || !row) return res.json({ success: false, message: 'Kartu tidak ditemukan.' });
    if (row.is_active === 1) return res.json({ success: false, message: 'Kartu ini sudah diaktifkan sebelumnya.' });
    if (row.pin_default !== pin.trim()) return res.json({ success: false, message: 'PIN 4-digit salah.' });

    const googleReviewUrl = `https://search.google.com/local/writereview?placeid=${place_id}`;
    const now = new Date().toISOString();

    db.run(
      `UPDATE cards SET is_active = 1, place_id = ?, review_url = ?, activated_at = ? WHERE card_id = ?`,
      [place_id, googleReviewUrl, now, cleanCardId],
      function (updateErr) {
        if (updateErr) return res.json({ success: false, message: 'Gagal mengaktifkan kartu.' });
        res.json({ success: true, message: 'Aktivasi berhasil!', review_url: googleReviewUrl });
      }
    );
  });
});

app.post('/api/admin/generate-cards', (req, res) => {
  const { prefix = 'CARD', count = 10 } = req.body;
  const createdCards = [];
  const stmt = db.prepare('INSERT OR IGNORE INTO cards (card_id, pin_default) VALUES (?, ?)');

  for (let i = 1; i <= count; i++) {
    const cardId = `${prefix}-${String(i).padStart(4, '0')}`;
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    stmt.run(cardId, pin);
    createdCards.push({ card_id: cardId, pin_default: pin });
  }

  stmt.finalize();
  res.json({ success: true, message: `Berhasil membuat ${count} kartu!`, data: createdCards });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server berjalan di http://localhost:${PORT}`));