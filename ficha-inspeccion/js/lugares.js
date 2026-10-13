/* Resolución del Lugar (Administración Zonal, Parroquia, Barrio y Microcuenca) a partir
   de un punto: normalmente el centroide del área de inspección.

   Carga una sola vez `datos/lugares.geojson` (un FeatureCollection con las 3 capas,
   distinguidas por la propiedad "tipo") y responde con prueba punto-en-polígono.
   Todo ocurre en el teléfono: funciona sin conexión una vez cacheado el archivo. */
const Lugares = (() => {
  const RUTA = 'datos/lugares.geojson';

  let promesa = null;    // carga en curso o terminada
  let capas = null;      // { zonal: [...], barrio: [...], micro: [...] }
  let extension = null;  // [oeste, sur, este, norte] de todo el conjunto

  /* Todas las anillas (exteriores y huecos) de una geometría. */
  function anillosDe(geom) {
    if (!geom) return [];
    const polis = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
    const out = [];
    for (const poli of polis) for (const anillo of poli) out.push(anillo);
    return out;
  }

  /* Precalcula el rectángulo envolvente de cada polígono para descartar rápido. */
  function preparar(g) {
    const c = { zonal: [], barrio: [], micro: [] };
    let s = 90, n = -90, w = 180, e = -180;
    for (const f of g.features) {
      const pr = f.properties || {};
      const an = anillosDe(f.geometry);
      if (!an.length) continue;
      let xs = 180, ys = 90, xe = -180, ye = -90;
      for (const a of an) {
        for (const p of a) {
          if (p[0] < xs) xs = p[0];
          if (p[0] > xe) xe = p[0];
          if (p[1] < ys) ys = p[1];
          if (p[1] > ye) ye = p[1];
        }
      }
      if (xs < w) w = xs;
      if (xe > e) e = xe;
      if (ys < s) s = ys;
      if (ye > n) n = ye;
      const lista = c[pr.tipo];
      if (lista) lista.push({ pr, bb: [xs, ys, xe, ye], an });
    }
    extension = [w, s, e, n];
    return c;
  }

  /* Punto en polígono por lanzamiento de rayo. */
  function enAnillo(x, y, anillo) {
    let dentro = false;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const xi = anillo[i][0], yi = anillo[i][1];
      const xj = anillo[j][0], yj = anillo[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  }

  function buscar(lat, lng, lista) {
    for (const it of lista) {
      const b = it.bb;
      if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
      for (const a of it.an) if (enAnillo(lng, lat, a)) return it.pr;
    }
    return null;
  }

  /* Carga el archivo una sola vez (la promesa queda memoizada). */
  function cargar() {
    /* Si la app se abrió como archivo local (file://), el navegador prohíbe leer
       otros archivos del disco con fetch. Se avisa con un mensaje claro en vez
       del error técnico del navegador. */
    if (typeof location !== 'undefined' && location.protocol === 'file:') {
      return Promise.reject(new Error('la app está abierta como archivo local y el navegador no deja leer los datos del lugar. Ábrela desde un servidor (http://) o desde el teléfono'));
    }
    if (!promesa) {
      promesa = fetch(RUTA)
        .then((r) => {
          if (!r.ok) throw new Error('no se pudo leer ' + RUTA + ' (' + r.status + ')');
          return r.json();
        })
        .then((g) => { capas = preparar(g); return true; })
        .catch((e) => { promesa = null; throw e; });   // permite reintentar
    }
    return promesa;
  }

  const listo = () => !!capas;

  /* Devuelve { fuera, zonal, parroquia, barrio, microcuenca }.
     Las claves sin dato vienen como cadena vacía. */
  async function resolver(lat, lng) {
    await cargar();
    const ex = extension;
    const fuera = lng < ex[0] || lng > ex[2] || lat < ex[1] || lat > ex[3];
    const z = buscar(lat, lng, capas.zonal);
    const b = buscar(lat, lng, capas.barrio);
    const m = buscar(lat, lng, capas.micro);
    return {
      fuera,
      zonal: z ? z.nombre : '',
      parroquia: b ? b.parroquia : '',
      barrio: b ? b.nombre : '',
      microcuenca: m ? m.nombre : ''
    };
  }

  return { cargar, listo, resolver };
})();
