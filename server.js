const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Keys configured on the server (Render dashboard → Environment). A key sent
// by the browser (saved in its Settings) always wins; the env var is the fallback.
const KEYS = {
  claude: process.env.ANTHROPIC_API_KEY || '',
  pexels: process.env.PEXELS_API_KEY || '',
  unsplash: process.env.UNSPLASH_ACCESS_KEY || ''
};

// Tells the client which keys exist server-side (booleans only, never values).
app.get('/api/config', (req, res) => {
  res.json({ claude: !!KEYS.claude, pexels: !!KEYS.pexels, unsplash: !!KEYS.unsplash });
});

app.post('/api/claude', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || KEYS.claude;
    if (!apiKey) return res.status(401).json({ error: { message: 'No Claude API key — add one in Settings or set ANTHROPIC_API_KEY on the server.' } });
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pexels', async (req, res) => {
  try {
    const key = req.headers['x-pexels-key'] || KEYS.pexels;
    if (!key) return res.status(401).json({ error: 'No Pexels API key configured' });
    const { query = '', per_page = '2' } = req.query;
    const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${encodeURIComponent(per_page)}&orientation=landscape`, {
      headers: { Authorization: key }
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/unsplash', async (req, res) => {
  try {
    const key = req.headers['x-unsplash-key'] || KEYS.unsplash;
    if (!key) return res.status(401).json({ error: 'No Unsplash access key configured' });
    const { query = '', per_page = '2' } = req.query;
    const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${encodeURIComponent(per_page)}&orientation=landscape`, {
      headers: { Authorization: `Client-ID ${key}` }
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));
