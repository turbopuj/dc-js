const express = require('express');
const axios = require('axios');
const router = express.Router();

function extractInfo(chaine, start, stop) {
  const s = chaine.indexOf(start) + start.length;
  const l = chaine.indexOf(stop, s) - s;
  return chaine.substring(s, s + l);
}

router.get('/dc_to_gpx_lieu', async (req, res) => {
  try {
    const urlLieu = 'https://www.descente-canyon.com/canyoning/lieu/01025/Haute-Savoie.html';

    const axiosConfig = {
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false
      })
    };

    const lieuResponse = await axios.get(urlLieu, axiosConfig);
    const lieu = lieuResponse.data;

    const extrait = extractInfo(lieu, 'var rows = ', ', searchNom =');
    const canyonIds = [...extrait.matchAll(/canyon\/([0-9]+)\//g)].map(m => m[1]);

    let display = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n';
    display += '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Descente Canyon Converter">\n';
    display += `  <metadata>\n    <link href="${urlLieu}">\n      <text>Lien vers le topo</text>\n    </link>\n  </metadata>\n`;

    for (const id of canyonIds) {
      const urlCarte = `https://www.descente-canyon.com/canyoning/canyon-carte/${id}/carte.html`;
      const urlTopo = `https://www.descente-canyon.com/canyoning/canyon-description/${id}/topo.html`;
      const urlBase = `https://www.descente-canyon.com/canyoning/canyon/${id}/`;

      try {
        const [carteResp, topoResp] = await Promise.all([
          axios.get(urlCarte, axiosConfig).catch(() => null),
          axios.get(urlTopo, axiosConfig).catch(() => null)
        ]);

        if (!carteResp || !carteResp.data) continue;

        const carte = carteResp.data;
        const topo = topoResp ? topoResp.data : '';

        const pointRegex = /var point =(.+?);addMarker/g;
        const points = [...carte.matchAll(pointRegex)];

        let titreClean = 'Canyon';
        if (topo) {
          try {
            const titreTopo = extractInfo(topo, '<h1 class="nom">', '</h1>');
            titreClean = titreTopo.replace(/<[^>]*>/g, '');
          } catch (e) {}
        }

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

          switch (type) {
            case 'parking_amont':
            case 'parking_aval':
            case 'parking':
              display += `    <name>Parking${remarque}</name>\n`;
              display += `    <sym>parking</sym>\n`;
              display += `    <type>parking</type>\n`;
              break;
            case 'depart':
              display += `    <name>Départ ${titreClean}${remarque}</name>\n`;
              display += `    <sym>place</sym>\n`;
              display += `    <type>place</type>\n`;
              break;
            case 'arrivee':
              display += `    <name>Arrivée ${titreClean}${remarque}</name>\n`;
              display += `    <sym>warningflag</sym>\n`;
              display += `    <type>warningflag</type>\n`;
              break;
            default:
              display += `    <name>${type}${remarque}</name>\n`;
          }

          display += `  </wpt>\n`;
        }
      } catch (err) {
        console.error(`Erreur canyon ${id}:`, err.message);
      }
    }

    display += '</gpx>\n';

    res.setHeader('Content-Type', 'application/gpx+xml');
    res.setHeader('Content-Disposition', 'attachment; filename=canyon_hautesavoie.gpx');
    res.send(display);

  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).send('Erreur lors de la génération du fichier GPX');
  }
});

module.exports = router;
