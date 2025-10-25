const axios = require('axios');
const https = require('https');

function extractInfo(chaine, start, stop) {
  const s = chaine.indexOf(start) + start.length;
  const l = chaine.indexOf(stop, s) - s;
  return chaine.substring(s, s + l);
}

module.exports = async (req, res) => {
  try {
    let id = parseInt(req.query.id);

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

    const axiosConfig = {
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    };

    const [carteResponse, topoResponse] = await Promise.all([
      axios.get(urlCarte, axiosConfig).catch(() => null),
      axios.get(urlTopo, axiosConfig).catch(() => null)
    ]);

    if (!carteResponse || !carteResponse.data) {
      return res.status(404).send('Topo inexistant');
    }

    const carte = carteResponse.data;
    const topo = topoResponse ? topoResponse.data : '';

    let display = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n';
    display += '<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Descente Canyon Converter">\n';
    display += `  <metadata>\n    <link href="${urlBase}">\n      <text>Lien vers le topo</text>\n    </link>\n  </metadata>\n`;

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
          display += `    <name>Parking amont${remarque}</name>\n`;
          display += `    <sym>parking</sym>\n`;
          display += `    <type>parking</type>\n`;
          break;
        case 'parking_aval':
          display += `    <name>Parking aval${remarque}</name>\n`;
          display += `    <sym>parking</sym>\n`;
          display += `    <type>parking</type>\n`;
          break;
        case 'parking':
          display += `    <name>Parking${remarque}</name>\n`;
          display += `    <sym>parking</sym>\n`;
          display += `    <type>parking</type>\n`;
          break;
        case 'depart':
          display += `    <name>Départ ${titreClean}${remarque}</name>\n`;
          display += `    <sym>place</sym>\n`;
          display += `    <type>place</type>\n`;
          display += `    <link href="${urlBase}"><text>Lien vers le topo</text></link>\n`;
          break;
        case 'arrivee':
          display += `    <name>Arrivée ${titreClean}${remarque}</name>\n`;
          display += `    <sym>warningflag</sym>\n`;
          display += `    <type>warningflag</type>\n`;
          break;
        default:
          display += `    <name>${type}${remarque}</name>\n`;
          break;
      }

      display += `  </wpt>\n`;
    }

    display += '</gpx>\n';

    res.setHeader('Content-Type', 'application/gpx+xml');
    res.setHeader('Content-Disposition', `attachment; filename=canyon${id}.gpx`);
    res.status(200).send(display);

  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).send('Erreur lors de la génération du fichier GPX: ' + error.message);
  }
};
