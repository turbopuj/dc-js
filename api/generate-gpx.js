const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).send('URL manquante');
    }

    // Extraire l'ID du canyon depuis n'importe quelle URL descente-canyon
    // Accepte : /canyon/2669/, /canyon-carte/2669/, /canyon-description/2669/, etc.
    const idMatch = url.match(/\/(\d+)\//);
    if (!idMatch) {
      return res.status(400).send('ID de canyon introuvable dans l\'URL');
    }
    const id = idMatch[1];

    console.log(`Traitement du canyon ID: ${id}`);

    // URLs à scrapper
    const carteUrl = `https://www.descente-canyon.com/canyoning/canyon-carte/${id}/carte.html`;
    const topoUrl = `https://www.descente-canyon.com/canyoning/canyon-description/${id}/topo.html`;
    const baseUrl = `https://www.descente-canyon.com/canyoning/canyon/${id}/`;

    // Config axios avec timeout et user agent
    const config = {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    // Télécharger les pages en parallèle
    const [carteResp, topoResp] = await Promise.all([
      axios.get(carteUrl, config).catch(err => {
        console.error('Erreur carte:', err.message);
        return null;
      }),
      axios.get(topoUrl, config).catch(err => {
        console.error('Erreur topo:', err.message);
        return null;
      })
    ]);

    if (!carteResp || !carteResp.data) {
      return res.status(404).send('Carte du canyon introuvable');
    }

    const carte = carteResp.data;
    const topo = topoResp ? topoResp.data : '';

    // Extraire le nom du canyon depuis la page topo
    let nomCanyon = 'Canyon';
    if (topo) {
      const $topo = cheerio.load(topo);
      // Chercher le h1 qui contient le nom
      const h1Text = $topo('h1').first().text();
      if (h1Text) {
        // Nettoyer le texte (enlever les espaces multiples, sauts de ligne)
        nomCanyon = h1Text.replace(/\s+/g, ' ').trim();
      }
    }

    console.log(`Nom du canyon: ${nomCanyon}`);

    // Extraire les points GPS depuis le JavaScript de la page carte
    const points = [];
    
    // Pattern pour détecter les points GPS dans le JavaScript
    // Exemple: var point = {position: new google.maps.LatLng(46.3123, 8.9456), type: 'parking', ...}
    const pointRegex = /var point\s*=\s*\{([^}]+)\}/g;
    let match;

    while ((match = pointRegex.exec(carte)) !== null) {
      const pointData = match[1];
      
      // Extraire les coordonnées (plusieurs formats possibles)
      const coordMatch = pointData.match(/LatLng\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
      
      // Extraire le type
      const typeMatch = pointData.match(/type\s*:\s*['"]([^'"]+)['"]/);
      
      // Extraire la remarque (optionnelle)
      const remarqueMatch = pointData.match(/remarque\s*:\s*['"]([^'"]*)['"]/);

      if (coordMatch && typeMatch) {
        points.push({
          lat: parseFloat(coordMatch[1]),
          lng: parseFloat(coordMatch[2]),
          type: typeMatch[1],
          remarque: remarqueMatch ? remarqueMatch[1] : ''
        });
      }
    }

    console.log(`${points.length} points GPS trouvés`);

    if (points.length === 0) {
      return res.status(404).send('Aucun point GPS trouvé pour ce canyon');
    }

    // Construire le fichier GPX
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Canyon GPX Converter" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(nomCanyon)}</name>
    <link href="${baseUrl}">
      <text>Voir le topo sur Descente-Canyon</text>
    </link>
  </metadata>
`;

    // Ajouter chaque waypoint
    points.forEach((point, index) => {
      const remarque = point.remarque ? ` (${point.remarque})` : '';
      let nom = '';
      let symbole = 'circle';

      // Adapter le nom et le symbole selon le type de point
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
          symbole = 'trail head';
          break;
        case 'arrivee':
          nom = `Arrivée ${nomCanyon}${remarque}`;
          symbole = 'flag';
          break;
        case 'cascade':
          nom = `Cascade${remarque}`;
          symbole = 'water';
          break;
        default:
          nom = `${point.type}${remarque}`;
          symbole = 'circle';
      }

      gpx += `  <wpt lat="${point.lat}" lon="${point.lng}">
    <name>${escapeXml(nom)}</name>
    <sym>${symbole}</sym>
    <type>${escapeXml(point.type)}</type>
  </wpt>
`;
    });

    gpx += `</gpx>`;

    // Envoyer le fichier GPX
    res.setHeader('Content-Type', 'application/gpx+xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="canyon-${id}.gpx"`);
    res.status(200).send(gpx);

  } catch (error) {
    console.error('Erreur générale:', error);
    res.status(500).send(`Erreur serveur: ${error.message}`);
  }
};

// Fonction utilitaire pour échapper les caractères XML
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
