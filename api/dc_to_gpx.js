const express = require('express');
const axios = require('axios');
const router = express.Router();

// Fonction utilitaire pour extraire des informations
function extractInfo(chaine, start, stop) {
  const s = chaine.indexOf(start) + start.length;
  const l = chaine.indexOf(stop, s) - s;
  return chaine.substring(s, s + l);
}

router.get('/dc_to_gpx', async (req, res) => {
  try {
    let id = parseInt(req.query.id);

    // Si pas d'ID, essayer d'extraire depuis l'URL
    if (!id && req.query.url) {
      const urlMatch = req.query.url.match(/https?:.*descente-canyon.*\/([0-9]+)\//);
      id = urlMatch ? parseInt(urlMatch[1]) : 0;
    }

    if (!id) {
      return res.status(400).send('Erreur de saisie. Aucun identifiant valide saisi');
    }

    const urlCarte = `https://www.descente-canyon.com/canyoning/canyon-carte/${id}/carte.html`;
    const urlBase = `https://www.descente-canyon.com/canyoning/canyon/${id}/`;
    const urlTopo = `https://www.descente-canyon.com/canyoning/canyon-description/${id}/topo.html`;
    const urlDebit = `https://www.descente-canyon.com/canyoning/canyon-debit/${id}/observations.html`;

    // Configuration axios pour ignorer les certificats SSL
    const axiosConfig = {
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false
      })
    };

    // Téléchargement des données
    const [carteResponse, topoResponse] = await Promise.all([
      axios.get(urlCarte, axiosConfig).catch(() => null),
      axios.get(urlTopo, axiosConfig).catch(() => null)
    ]);

    if (!carteResponse || !carteResponse.data) {
      return res.status(404).send('Topo inexistant');
    }

    const carte = carteResponse.data;
    const topo = topoResponse ? topoResponse.data : '';

    // Entête XML
    let display = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n';
    display += '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Descente Canyon Converter">\n';
    display += `  <metadata>\n    <link href="${urlBase}">\n      <text>Lien vers le topo</text>\n    </link>\n  </metadata>\n`;

    // Extraction des coordonnées
    const pointRegex = /var point =(.+?);addMarker/g;
    const points = [...carte.matchAll(pointRegex)];

    // Titre du topo
    let titreClean = 'Canyon';
    if (topo) {
      try {
        const titreTopo = extractInfo(topo, '<h1 class="nom">', '</h1>');
        titreClean = titreTopo.replace(/<[^>]*>/g, '');
      } catch (e) {}
    }

    // Traitement de chaque point
    for (const point of points) {
      const pointData = point[1];
      
      const coordMatch = pointData.match(/LatLng\(([^)]+)\)/);
      const typeMatch = pointData.match(/type\s*:\s*'([^']+)'/);
      const remarqueMatch = pointData.match(/remarque\s*:\s*'([^']+)'\s*,auteur/);

      if (!coordMatch || !typeMatch) continue;

      const [lat, lng] = coordMatch[1].split(',').map(s => s.trim());
      const type = typeMatch[1];
      const remarque = remarqueMatch ? ` (${remarqueMatch[1]})` : '';

      display += `  <wpt lat="${lat}" lon="${lng}">\n`;

      // Personnalisation selon le type de point
      switch (type) {
        case 'parking_amont':
          display += `    <name>Parking amont${remarque}</name>\n`;
          display += `    <sym>parking</sym>\n`;
          display += `    <type>parking</type>\n`;
          display += `    <extensions></extensions>\n`;
          break;
        case 'parking_aval':
          display += `    <name>Parking aval${remarque}</name>\n`;
          display += `    <sym>parking</sym>\n`;
          display += `    <type>parking</type>\n`;
          display += `    <extensions></extensions>\n`;
          break;
        case 'parking':
          display += `    <name>Parking${remarque}</name>\n`;
          display += `    <sym>parking</sym>\n`;
          display += `    <type>parking</type>\n`;
          display += `    <extensions></extensions>\n`;
          break;
        case 'depart':
          display += `    <name>Départ ${titreClean}${remarque}</name>\n`;
          display += `    <sym>place</sym>\n`;
          display += `    <type>place</type>\n`;
          display += `    <extensions></extensions>\n`;
          display += `    <link href="${urlBase}"><text>Lien vers le topo</text></link>\n`;
          break;
        case 'arrivee':
          display += `    <name>Arrivée ${titreClean}${remarque}</name>\n`;
          display += `    <sym>warningflag</sym>\n`;
          display += `    <type>warningflag</type>\n`;
          display += `    <extensions></extensions>\n`;
          break;
        default:
          display += `    <name>${type}${remarque}</name>\n`;
          break;
      }

      display += `  </wpt>\n`;
    }

    display += '</gpx>\n';

    // Envoi du fichier GPX
    res.setHeader('Content-Type', 'application/gpx+xml');
    res.setHeader('Content-Disposition', `attachment; filename=canyon${id}.gpx`);
    res.send(display);

  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).send('Erreur lors de la génération du fichier GPX');
  }
});

module.exports = router;
