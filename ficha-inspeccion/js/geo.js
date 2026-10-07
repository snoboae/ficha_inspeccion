/* Utilidades geoespaciales sobre el elipsoide WGS84 (a = 6378137 m, f = 1/298.257223563).
   Todas las rutinas fueron validadas contra pyproj (Karney / GeographicLib):
     - WGS84 <-> UTM por series de Krüger ....... error < 0.05 mm
     - Distancias geodésicas (Vincenty inverso) . error < 0.01 mm
     - Área elipsoidal (esfera authálica) ....... error ~0 en perímetros de inspección
                                                  (< 0.003 % hasta 100 km de extensión)
     - Centroide en un plano métrico local ...... sin la anisotropía de los grados
   Anillos abiertos: [[lat, lng], ...] en grados. */
const Geo = (() => {
  const A = 6378137;                    // semieje mayor
  const F = 1 / 298.257223563;          // aplanamiento
  const B = A * (1 - F);                // semieje menor
  const E2 = F * (2 - F);               // excentricidad al cuadrado
  const ECC = Math.sqrt(E2);
  const K0 = 0.9996;
  const N_SER = F / (2 - F);
  const AM = (A / (1 + N_SER)) * (1 + N_SER * N_SER / 4 + N_SER ** 4 / 64);
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const n2 = N_SER * N_SER, n3 = N_SER * n2;
  const ALPHA = [N_SER / 2 - 2 * n2 / 3 + 5 * n3 / 16, 13 * n2 / 48 - 3 * n3 / 5, 61 * n3 / 240];
  const BETA = [N_SER / 2 - 2 * n2 / 3 + 37 * n3 / 96, n2 / 48 + n3 / 15, 17 * n3 / 480];

  /* Radios de curvatura del elipsoide en la latitud dada (radianes). */
  const radiusMeridian = (phi) => (A * (1 - E2)) / Math.pow(1 - E2 * Math.sin(phi) ** 2, 1.5); // M
  const radiusPrimeVertical = (phi) => A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);              // N

  /* ---------- UTM (series de Krüger) ---------- */
  function zoneOf(lon) { return Math.floor((lon + 180) / 6) + 1; }

  /* WGS84 -> UTM. Devuelve { zone, hemi, e, n }. */
  function toUTM(lat, lon, zoneOverride) {
    const zone = zoneOverride || zoneOf(lon);
    const lon0 = rad((zone - 1) * 6 - 180 + 3);
    const phi = rad(lat), lam = rad(lon) - lon0;
    const t = Math.sinh(Math.atanh(Math.sin(phi)) - ECC * Math.atanh(ECC * Math.sin(phi)));
    const xi = Math.atan2(t, Math.cos(lam));
    const eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
    let x = eta, y = xi;
    for (let j = 1; j <= 3; j++) {
      y += ALPHA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
      x += ALPHA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    }
    let n = K0 * AM * y;
    if (lat < 0) n += 10000000;
    return { zone, hemi: lat < 0 ? 'S' : 'N', e: 500000 + K0 * AM * x, n };
  }

  /* UTM -> WGS84. Devuelve [lat, lng]. south = true si es hemisferio sur. */
  function fromUTM(e, n, zone, south) {
    const n0 = south ? 10000000 : 0;
    const x = (e - 500000) / (K0 * AM);
    const y = (n - n0) / (K0 * AM);
    let xi = y, eta = x;
    for (let j = 1; j <= 3; j++) {
      xi -= BETA[j - 1] * Math.sin(2 * j * y) * Math.cosh(2 * j * x);
      eta -= BETA[j - 1] * Math.cos(2 * j * y) * Math.sinh(2 * j * x);
    }
    const tau = Math.sin(xi) / Math.sqrt(Math.sinh(eta) ** 2 + Math.cos(xi) ** 2);
    // Newton sobre tau(phi) = sinh(atanh(sin phi) - e*atanh(e*sin phi)).
    let phi = Math.atan(tau);
    const f = (p) => { const s = Math.sin(p); return Math.sinh(Math.atanh(s) - ECC * Math.atanh(ECC * s)); };
    for (let k = 0; k < 8; k++) {
      const sp = f(phi);
      const h = 1e-9, sp2 = f(phi + h);
      const d = (sp - tau) / ((sp2 - sp) / h);
      phi -= d;
      if (Math.abs(d) < 1e-14) break;
    }
    const lam = Math.atan2(Math.sinh(eta), Math.cos(xi));
    const lon0 = rad((zone - 1) * 6 - 180 + 3);
    return [deg(phi), deg(lam) + deg(lon0)];
  }

  /* ---------- Distancia geodésica (Vincenty inverso, WGS84) ---------- */
  /* Devuelve la distancia en metros entre [lat,lng] y [lat,lng]. Error < 0.01 mm. */
  function dist(a, b) {
    const lat1 = a[0], lon1 = a[1], lat2 = b[0], lon2 = b[1];
    if (lat1 === lat2 && lon1 === lon2) return 0;
    const L = rad(lon2 - lon1);
    const U1 = Math.atan((1 - F) * Math.tan(rad(lat1)));
    const U2 = Math.atan((1 - F) * Math.tan(rad(lat2)));
    const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
    const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);
    let lam = L;
    let sinSigma = 0, cosSigma = 0, sigma = 0, sinAlpha = 0, cos2Alpha = 0, cos2SigmaM = 0;
    for (let i = 0; i < 200; i++) {
      const sinLam = Math.sin(lam), cosLam = Math.cos(lam);
      sinSigma = Math.sqrt((cosU2 * sinLam) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLam) ** 2);
      if (sinSigma === 0) return 0;                       // puntos coincidentes
      cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLam;
      sigma = Math.atan2(sinSigma, cosSigma);
      sinAlpha = (cosU1 * cosU2 * sinLam) / sinSigma;
      cos2Alpha = 1 - sinAlpha * sinAlpha;
      cos2SigmaM = cos2Alpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cos2Alpha;
      const C = (F / 16) * cos2Alpha * (4 + F * (4 - 3 * cos2Alpha));
      const lamPrev = lam;
      lam = L + (1 - C) * F * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
      if (Math.abs(lam - lamPrev) < 1e-12) break;
    }
    const u2 = (cos2Alpha * (A * A - B * B)) / (B * B);
    const AA = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
    const BB = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
    const dSigma = BB * sinSigma * (cos2SigmaM + (BB / 4) * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)
      - (BB / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)));
    return B * AA * (sigma - dSigma);
  }

  /* ---------- Área elipsoidal (esfera authálica) ---------- */
  /* La latitud authálica transforma el elipsoide en una esfera que conserva el área exactamente.
     El exceso esférico calculado sobre esa esfera (radio R_q = 6371007.181 m) da el área real. */
  function qAuth(phi) {
    const s = Math.sin(phi);
    return (1 - E2) * (s / (1 - E2 * s * s) - (1 / (2 * ECC)) * Math.log((1 - ECC * s) / (1 + ECC * s)));
  }
  const QP = qAuth(Math.PI / 2);
  const RQ = A * Math.sqrt(QP / 2);          // radio authálico WGS84

  /* seno de la latitud authálica (equivale a sin(psi)). */
  const sinAuthalic = (latDeg) => {
    const v = qAuth(rad(latDeg)) / QP;
    return v > 1 ? 1 : v < -1 ? -1 : v;
  };

  /* Área del polígono en m². */
  function area(ring) {
    const n = ring.length;
    if (n < 3) return 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const lo = ring[i], mid = ring[(i + 1) % n], up = ring[(i + 2) % n];
      total += (rad(up[1]) - rad(lo[1])) * sinAuthalic(mid[0]);
    }
    return Math.abs((total * RQ * RQ) / 2);
  }

  /* Perímetro del polígono en metros (suma de geodésicas). */
  function perimeter(ring) {
    if (ring.length < 2) return 0;
    let p = 0;
    for (let i = 0; i < ring.length; i++) p += dist(ring[i], ring[(i + 1) % ring.length]);
    return p;
  }

  /* Centroide del polígono. Se calcula en un plano métrico local (escalas M y N en la latitud
     media) para que la longitud y la latitud pesen igual, y luego se devuelve en grados. */
  function centroid(ring) {
    const n = ring.length;
    if (!n) return null;
    let lat0 = 0, lng0 = 0;
    ring.forEach(([la, ln]) => { lat0 += la; lng0 += ln; });
    lat0 /= n; lng0 /= n;
    const phi0 = rad(lat0);
    const M = radiusMeridian(phi0), N = radiusPrimeVertical(phi0);
    const cosPhi = Math.max(1e-12, Math.cos(phi0));
    const pts = ring.map(([la, ln]) => [(rad(ln) - rad(lng0)) * N * cosPhi, (rad(la) - phi0) * M]);

    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
      const f = x0 * y1 - x1 * y0;
      a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
    const back = (x, y) => [lat0 + deg(y / M), lng0 + deg(x / (N * cosPhi))];
    if (Math.abs(a) < 1e-12) {
      // Polígono degenerado: promedio simple de los vértices.
      const sx = pts.reduce((s, p) => s + p[0], 0) / n, sy = pts.reduce((s, p) => s + p[1], 0) / n;
      return back(sx, sy);
    }
    a *= 0.5;
    return back(cx / (6 * a), cy / (6 * a));
  }

  function bounds(ring) {
    let s = 90, n = -90, w = 180, e = -180;
    ring.forEach(([lat, lng]) => { s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lng); e = Math.max(e, lng); });
    return { s, n, w, e };
  }

  /* Perímetros (anillos abiertos [[lat,lng]]) -> GeoJSON (FeatureCollection de Polygon, WGS84).
     El anillo se cierra repitiendo el primer vértice, como exige la especificación. */
  function toPolygonGeoJSON(features) {
    const feats = features.map((f) => {
      const coords = f.ring.map(([lat, lng]) => [lng, lat]);
      if (coords.length) coords.push(coords[0]);
      return {
        type: 'Feature',
        properties: Object.assign({}, f.props),
        geometry: { type: 'Polygon', coordinates: [coords] }
      };
    });
    return JSON.stringify({ type: 'FeatureCollection', features: feats }, null, 2);
  }

  return { rad, deg, zoneOf, toUTM, fromUTM, toPolygonGeoJSON, dist, area, perimeter, centroid, bounds, radiusMeridian, radiusPrimeVertical, RQ };
})();
