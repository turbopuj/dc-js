const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).send('URL manquante');
    }

    // Extraire l'ID du canyon depuis l'URL
    const idMatch = url.match(/canyon\/(\d+)\//);
    if (!idMatch) {
      return res.status(400).send('URL invalide');
    }
    const id = idMatch[1];

    // URLs à scrapper
    const carteUrl = `https://www.descente-canyon.com/canyoning/canyon-carte/${id}/carte.html`;
    const topoUrl = `https://www.descente-canyon.com/canyoning/canyon-description/${id}/topo.html`;

    // Télécharger les pages
    const [carteResp, topoResp] = await Promise.all([
      axios.get(carteUrl, { 
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }).catch(() => null),
      axios.get(topoUrl, { 
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }).catch(() => null)
    ]);

    if (!carteResp || !carteResp.data) {
      return res.status(404).send('Canyon introuvable');
    }

    const carte = carteResp.data;
    const topo = topoResp ? topoResp.data : '';

    // Extraire le titre du canyon
    let nomCanyon = 'Canyon';
    if (topo) {
      const $topo = cheerio.load(topo);
      nomCanyon = $topo('h1.nom').text().trim() || 'Canyon';
    }

    // Extraire les points GPS depuis la carte
    const pointRegex = /var point = \{([^}]+)\};/g;
    const points = [];
    let match;

    while ((match = pointRegex.exec(carte)) !== null) {
      const pointData = match[1];
      
      // Extraire coordonnées
      const coordMatch = pointData.match(/new google\.maps\.LatLng\(([-\d.]+),\s*([-\d.]+)\)/);
      // Extraire type
      const typeMatch = pointData.match(/type\s*:\s*['"]([^'"]+)['"]/);
      // Extraire remarque
      const remarqueMatch = pointData.match(/remarque\s*:\s*['"]([^'"]*)['"]/);

      if (coordMatch && typeMatch) {
        points.push({
          lat: coordMatch[1],
          lng: coordMatch[2],
          type: typeMatch[1],
          remarque: remarqueMatch ? remarqueMatch[1] : ''
        });
      }
    }

    // Construire le GPX
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Canyon GPX Converter" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${nomCanyon}</name>
    <link href="${url}">
      <text>Voir le topo</text>
    </link>
  </metadata>
`;

    // Ajouter chaque point
    points.forEach(point => {
      const remarque = point.remarque ? ` (${point.remarque})` : '';
      let nom = '';
      let symbole = 'circle';

      switch (point.type) {
        case 'parking_amont':
          nom = `Parking amont${remarque}`;
          symbole = 'parking';
          break;
        case 'parking_aval':
          nom = `Parking aval${remarque}`;
          symbole = 'parking';
          break;
        case 'parking':
          nom = `Parking${remarque}`;
          symbole = 'parking';
          break;
        case 'depart':
          nom = `Départ ${nomCanyon}${remarque}`;
          symbole = 'place';
          break;
        case 'arrivee':
          nom = `Arrivée ${nomCanyon}${remarque}`;
          symbole = 'flag';
          break;
        default:
          nom = `${point.type}${remarque}`;
      }

      gpx += `  <wpt lat="${point.lat}" lon="${point.lng}">
    <name>${nom}</name>
    <sym>${symbole}</sym>
  </wpt>
`;
    });

    gpx += `</gpx>`;

    // Envoyer le fichier
    res.setHeader('Content-Type', 'application/gpx+xml');
    res.setHeader('Content-Disposition', `attachment; filename=canyon-${id}.gpx`);
    res.status(200).send(gpx);

  } catch (error) {
    console.error('Erreur:', error.message);
    res.status(500).send(`Erreur: ${error.message}`);
  }
};
