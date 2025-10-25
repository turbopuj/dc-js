const express = require('express');
const path = require('path');
const cors = require('cors');
const gpxRoutes = require('./api/dc_to_gpx');
const gpxLieuRoutes = require('./api/dc_to_gpx_lieu');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir le fichier HTML statique
app.use(express.static('public'));

// Routes API
app.use('/api', gpxRoutes);
app.use('/api', gpxLieuRoutes);

// Route principale
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});

module.exports = app;
