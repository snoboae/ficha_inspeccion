/* Generación del .docx (Word) de una ficha, sin librerías externas.
   Un .docx es un ZIP con XML dentro: se arma con el mismo generador de ZIP que usa
   la exportación de fotos (js/zip.js).

   El documento usa estilos REALES de Word (Título 1 para las secciones), de modo que
   se puede editar, navegar y reestilizar; pero el aspecto busca parecerse al PDF:
   banda institucional, barras de sección en color y tablas. */
const Docx = (() => {
  const TW_CM = 566.93;     // twips por centímetro
  const EMU_CM = 360000;    // EMU por centímetro
  const TEAL = '0B4F4A', GRIS = '696F78', LINEA = 'C6CDD1';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const tw = (cm) => Math.round(cm * TW_CM);
  const emu = (cm) => Math.round(cm * EMU_CM);

  /* ---------- piezas de XML ---------- */
  function txt(texto, o) {
    o = o || {};
    const r = [];
    if (o.b) r.push('<w:b/>');
    if (o.i) r.push('<w:i/>');
    if (o.color) r.push('<w:color w:val="' + o.color + '"/>');
    if (o.sz) r.push('<w:sz w:val="' + o.sz + '"/><w:szCs w:val="' + o.sz + '"/>');
    if (o.font) r.push('<w:rFonts w:ascii="' + o.font + '" w:hAnsi="' + o.font + '"/>');
    return '<w:r>' + (r.length ? '<w:rPr>' + r.join('') + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + esc(texto) + '</w:t></w:r>';
  }
  const salto = () => '<w:r><w:br/></w:r>';
  const saltoPagina = () => '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

  function par(contenido, o) {
    o = o || {};
    const p = [];
    if (o.style) p.push('<w:pStyle w:val="' + o.style + '"/>');
    if (o.align) p.push('<w:jc w:val="' + o.align + '"/>');
    if (o.before != null || o.after != null) p.push('<w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after || 0) + '"/>');
    if (o.keepNext) p.push('<w:keepNext/>');
    return '<w:p>' + (p.length ? '<w:pPr>' + p.join('') + '</w:pPr>' : '') + contenido + '</w:p>';
  }
  const titulo = (texto) => par(txt(texto, { b: true }), { style: 'Heading1', keepNext: true });

  function celda(contenido, o) {
    o = o || {};
    const p = [];
    if (o.w) p.push('<w:tcW w:w="' + o.w + '" w:type="dxa"/>');
    if (o.span) p.push('<w:gridSpan w:val="' + o.span + '"/>');
    if (o.fill) p.push('<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>');
    if (o.centro) p.push('<w:vAlign w:val="center"/>');
    if (o.mar) p.push('<w:tcMar><w:top w:w="' + o.mar + '" w:type="dxa"/><w:left w:w="' + o.mar + '" w:type="dxa"/><w:bottom w:w="' + o.mar + '" w:type="dxa"/><w:right w:w="' + o.mar + '" w:type="dxa"/></w:tcMar>');
    return '<w:tc><w:tcPr>' + p.join('') + '</w:tcPr>' + contenido + '</w:tc>';
  }

  function tabla(filas, o) {
    o = o || {};
    const p = ['<w:tblW w:w="' + (o.w || 9638) + '" w:type="dxa"/><w:tblLayout w:type="fixed"/>'];
    if (o.bordes !== false) {
      const b = '<w:%s w:val="single" w:sz="4" w:space="0" w:color="' + LINEA + '"/>';
      p.push('<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((k) => b.replace('%s', k)).join('') + '</w:tblBorders>');
    }
    p.push('<w:tblCellMar><w:top w:w="57" w:type="dxa"/><w:left w:w="85" w:type="dxa"/><w:bottom w:w="57" w:type="dxa"/><w:right w:w="85" w:type="dxa"/></w:tblCellMar>');
    return '<w:tbl><w:tblPr>' + p.join('') + '</w:tblPr>'
      + '<w:tblGrid>' + o.grid.map((g) => '<w:gridCol w:w="' + g + '"/>').join('') + '</w:tblGrid>'
      + filas.join('') + '</w:tbl>';
  }

  function imagen(rId, id, nombre, wEmu, hEmu) {
    return '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:drawing>'
      + '<wp:inline distT="0" distB="0" distL="0" distR="0">'
      + '<wp:extent cx="' + wEmu + '" cy="' + hEmu + '"/>'
      + '<wp:docPr id="' + id + '" name="' + esc(nombre) + '"/>'
      + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
      + '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + esc(nombre) + '"/><pic:cNvPicPr/></pic:nvPicPr>'
      + '<pic:blipFill><a:blip r:embed="' + rId + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
      + '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + wEmu + '" cy="' + hEmu + '"/></a:xfrm>'
      + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'
      + '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  }

  /* dataURL -> bytes binarios */
  function aBytes(dataUrl) {
    const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl || '');
    if (!m) return null;
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, mime: m[1], ext: /png/i.test(m[1]) ? 'png' : 'jpeg' };
  }

  /* ---------- documento ---------- */
  async function fichaDoc(f, fotos) {
    const ANCHO = 9638;                       // 17 cm útiles
    const media = [], rels = [];
    let rid = 3, imgId = 0;

    /* Las imágenes se registran primero para conocer su rId antes de armar el cuerpo. */
    function registrar(dataUrl) {
      const d = aBytes(dataUrl);
      if (!d) return null;
      imgId++; rid++;
      const nombre = 'image' + imgId + '.' + d.ext;
      media.push({ name: 'word/media/' + nombre, bytes: d.bytes });
      rels.push('<Relationship Id="rId' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + nombre + '"/>');
      return 'rId' + rid;
    }

    const ridMapa = f.mapImage ? registrar(f.mapImage) : null;
    const ridFotos = (fotos || []).map((p) => registrar(p.dataUrl));

    /* --- bloque de datos generales --- */
    const mitad = Math.round(ANCHO / 2);
    const etiqueta = (t) => par(txt(t, { sz: 14, color: GRIS }), { after: 20 });
    const valor = (t) => par(txt(t || '-', { sz: 19 }), { after: 0 });
    const filasDatos = [];
    filasDatos.push('<w:tr>' + celda(etiqueta('TEMA') + valor(f.tema), { span: 2, w: ANCHO }) + '</w:tr>');

    const c = f.coord || {};
    const coordTxt = (c.e != null && isFinite(c.e)) ? 'X ' + c.e.toFixed(2) + '   Y ' + c.n.toFixed(2) + '   UTM ' + c.zone + (c.hemi || '') : '-';
    filasDatos.push('<w:tr>'
      + celda(etiqueta('FECHA') + valor(PDF.fmtDate(f.fecha)), { w: mitad })
      + celda(etiqueta('COORDENADA') + valor(coordTxt), { w: ANCHO - mitad })
      + '</w:tr>');

    if (f.ring && f.ring.length >= 3 && f.area != null && isFinite(f.area)) {
      filasDatos.push('<w:tr>' + celda(etiqueta('ÁREA DE INSPECCIÓN') + valor((f.area / 10000).toFixed(2) + ' ha'), { span: 2, w: ANCHO }) + '</w:tr>');
    }

    const l = f.lugar || {};
    const lineasLugar = [];
    if (l.zonal) lineasLugar.push('Administración Zonal: ' + l.zonal);
    if (l.parroquia) lineasLugar.push('Parroquia: ' + l.parroquia);
    if (l.barrio) lineasLugar.push('Barrio: ' + l.barrio);
    if (l.microcuenca) lineasLugar.push('Microcuenca: ' + l.microcuenca);
    const contenidoLugar = (lineasLugar.length ? lineasLugar : ['-']).map((t) => par(txt(t, { sz: 19 }), { after: 0 })).join('');
    filasDatos.push('<w:tr>' + celda(etiqueta('LUGAR') + contenidoLugar, { span: 2, w: ANCHO }) + '</w:tr>');

    const cuerpo = [];
    cuerpo.push(tabla(filasDatos, { w: ANCHO, grid: [mitad, ANCHO - mitad] }));
    cuerpo.push(par('', { after: 120 }));

    /* 1. Mapa de ubicación (cierra la primera página) */
    cuerpo.push(titulo('1. MAPA DE UBICACIÓN'));
    if (ridMapa) {
      const wEmu = emu(17), hEmu = Math.round(wEmu * 800 / 1200);
      cuerpo.push(imagen(ridMapa, 1, 'Mapa de ubicación', wEmu, hEmu));
    } else {
      cuerpo.push(par(txt('Sin mapa de ubicación (no se dibujó el área de inspección).', { color: GRIS })));
    }

    /* 2. Objetivo: siempre empieza en la página 2 */
    cuerpo.push(saltoPagina());

    const parrafos = (t) => {
      const t2 = String(t || '').trim();
      if (!t2) return par(txt('-', { color: GRIS }));
      return t2.split(/\r?\n/).map((ln) => (ln.trim() ? par(txt(ln)) : par(''))).join('');
    };
    const lista = (arr) => {
      const a = (arr || []).map((s) => String(s).trim()).filter(Boolean);
      if (!a.length) return par(txt('-', { color: GRIS }));
      return a.map((t, i) => par(txt((i + 1) + '.  ' + t))).join('');
    };

    cuerpo.push(titulo('2. OBJETIVO'));
    cuerpo.push(parrafos(f.objetivo));
    cuerpo.push(titulo('3. ANTECEDENTES'));
    cuerpo.push(parrafos(f.antecedentes));
    cuerpo.push(titulo('4. DESARROLLO DE ACTIVIDADES'));
    cuerpo.push(parrafos(f.desarrollo));
    cuerpo.push(titulo('5. PARTICIPANTES'));
    cuerpo.push(lista(f.participantes));

    /* 6. Registro fotográfico: 2 columnas, como el PDF */
    cuerpo.push(titulo('6. REGISTRO FOTOGRÁFICO'));
    if (!fotos || !fotos.length) {
      cuerpo.push(par(txt('Sin fotografías registradas.', { color: GRIS })));
    } else {
      const colW = Math.round(ANCHO / 2);
      const fotoW = 2900000;                       // EMU
      const filasFoto = [];
      for (let i = 0; i < fotos.length; i += 2) {
        const celdas = [];
        for (let k = 0; k < 2; k++) {
          const p = fotos[i + k];
          if (!p) { celdas.push(celda(par(''), { w: colW, mar: 85 })); continue; }
          const rel = ridFotos[i + k];
          let wEmu = fotoW, hEmu = Math.round(fotoW * (p.h / p.w));
          if (hEmu > 3400000) { const esc2 = 3400000 / hEmu; hEmu = 3400000; wEmu = Math.round(wEmu * esc2); }
          celdas.push(celda(imagen(rel, 100 + i + k, 'Foto ' + (i + k + 1), wEmu, hEmu)
            + par(txt('Foto ' + (i + k + 1) + (p.pie ? ': ' + p.pie : ''), { sz: 16, color: GRIS }), { style: 'PieFoto' }),
            { w: colW, mar: 85 }));
        }
        filasFoto.push('<w:tr>' + celdas.join('') + '</w:tr>');
      }
      cuerpo.push(tabla(filasFoto, { w: ANCHO, grid: [colW, colW] }));
    }

    cuerpo.push(titulo('7. RECOMENDACIONES'));
    cuerpo.push(lista(f.recomendaciones));

    /* 8. Firmas de responsabilidad */
    cuerpo.push(titulo('8. FIRMAS DE RESPONSABILIDAD'));
    const firmas = f.firmas || [];
    if (!firmas.length) {
      cuerpo.push(par(txt('-', { color: GRIS })));
    } else {
      const col = [Math.round(ANCHO * 0.17), Math.round(ANCHO * 0.28), Math.round(ANCHO * 0.25)];
      col.push(ANCHO - col[0] - col[1] - col[2]);
      const cab = ['DETALLE', 'NOMBRE', 'CARGO', 'FIRMA'];
      const filasFirma = ['<w:tr><w:trPr><w:tblHeader/></w:trPr>' + cab.map((t, i) => celda(par(txt(t, { b: true, color: 'FFFFFF', sz: 17 }), { after: 0 }), { w: col[i], fill: TEAL })).join('') + '</w:tr>'];
      firmas.forEach((fr) => {
        const datos = [fr.detalle || '-', fr.nombre || '-', fr.cargo || '-', ''];
        filasFirma.push('<w:tr><w:trPr><w:trHeight w:val="1440" w:hRule="atLeast"/></w:trPr>'
          + datos.map((t, i) => celda(par(txt(t, { sz: 18 }), { after: 0 }), { w: col[i], centro: i === 3 })).join('')
          + '</w:tr>');
      });
      cuerpo.push(tabla(filasFirma, { w: ANCHO, grid: col }));
    }

    /* --- encabezado de la primera página (banda institucional) --- */
    const linea = (t, o) => par(txt(t, o), { after: 20 });
    const banda = tabla(['<w:tr>'
      + celda(linea(f.institucion || '(Institución)', { b: true, color: 'FFFFFF', sz: 24 })
        + (f.dirArea ? linea(f.dirArea, { color: 'FFFFFF', sz: 17 }) : '')
        + (f.unidad ? linea(f.unidad, { color: 'FFFFFF', sz: 17 }) : '')
        + par(txt('INFORME DE INSPECCIÓN TÉCNICA', { b: true, color: 'FFFFFF', sz: 26 }), { before: 120, after: 0 }),
        { w: Math.round(ANCHO * 0.66), fill: TEAL, mar: 170 })
      + celda(par(txt('FICHA N°', { b: true, color: 'FFFFFF', sz: 14 }), { after: 20, align: 'right' })
        + par(txt(f.fichaNo || '-', { b: true, color: 'FFFFFF', sz: 24 }), { after: 20, align: 'right' })
        + par(txt(PDF.fmtDate(f.fecha), { color: 'FFFFFF', sz: 16 }), { after: 0, align: 'right' }),
        { w: ANCHO - Math.round(ANCHO * 0.66), fill: TEAL, mar: 170, centro: true })
      + '</w:tr>'], { w: ANCHO, grid: [Math.round(ANCHO * 0.66), ANCHO - Math.round(ANCHO * 0.66)], bordes: false });

    /* --- pie de página con numeración --- */
    const campo = (instr) => '<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
      + '<w:r><w:instrText xml:space="preserve"> ' + instr + ' </w:instrText></w:r>'
      + '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
      + '<w:r><w:t>1</w:t></w:r>'
      + '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
    const pie = '<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="' + ANCHO + '"/></w:tabs>'
      + '<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="' + LINEA + '"/></w:pBdr>'
      + '<w:rPr><w:sz w:val="15"/><w:color w:val="' + GRIS + '"/></w:rPr></w:pPr>'
      + txt((f.institucion || 'Ficha de inspección') + ' · FICHA N° ' + (f.fichaNo || '-'), { sz: 15, color: GRIS })
      + '<w:r><w:tab/></w:r>'
      + txt('Página ', { sz: 15, color: GRIS }) + campo('PAGE')
      + txt(' de ', { sz: 15, color: GRIS }) + campo('NUMPAGES')
      + '</w:p>';

    /* --- estilos --- */
    const estilos = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
      + '<w:docDefaults><w:rPrDefault><w:rPr>'
      + '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/>'
      + '<w:lang w:val="es-EC"/>'
      + '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
      + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
      + '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>'
      + '<w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>'
      + '<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="320" w:after="140"/>'
      + '<w:shd w:val="clear" w:color="auto" w:fill="' + TEAL + '"/><w:ind w:left="113" w:right="113"/></w:pPr>'
      + '<w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>'
      + '<w:style w:type="paragraph" w:styleId="PieFoto"><w:name w:val="Pie de foto"/><w:basedOn w:val="Normal"/>'
      + '<w:pPr><w:spacing w:before="60" w:after="140"/></w:pPr>'
      + '<w:rPr><w:color w:val="' + GRIS + '"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style>'
      + '</w:styles>';

    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
      + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
      + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      + 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    const cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

    const documento = cab + '<w:document ' + NS + '><w:body>' + cuerpo.join('')
      + '<w:sectPr>'
      + '<w:headerReference w:type="first" r:id="rId2"/>'
      + '<w:footerReference w:type="default" r:id="rId3"/>'
      + '<w:titlePg/>'
      + '<w:pgSz w:w="11906" w:h="16838"/>'
      + '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="397" w:footer="510" w:gutter="0"/>'
      + '</w:sectPr></w:body></w:document>';

    const encabezado = cab + '<w:hdr ' + NS + '>' + banda + '</w:hdr>';
    const piePagina = cab + '<w:ftr ' + NS + '>' + pie + '</w:ftr>';

    const relsDoc = cab + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'
      + rels.join('') + '</Relationships>';

    const tipos = cab + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Default Extension="png" ContentType="image/png"/>'
      + '<Default Extension="jpeg" ContentType="image/jpeg"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
      + '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
      + '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
      + '</Types>';

    const raiz = cab + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
      + '</Relationships>';

    const partes = [
      { name: '[Content_Types].xml', blob: new Blob([tipos]) },
      { name: '_rels/.rels', blob: new Blob([raiz]) },
      { name: 'word/document.xml', blob: new Blob([documento]) },
      { name: 'word/styles.xml', blob: new Blob([estilos]) },
      { name: 'word/header1.xml', blob: new Blob([encabezado]) },
      { name: 'word/footer1.xml', blob: new Blob([piePagina]) },
      { name: 'word/_rels/document.xml.rels', blob: new Blob([relsDoc]) }
    ];
    media.forEach((m) => partes.push({ name: m.name, blob: new Blob([m.bytes]) }));

    return Zip.build(partes);
  }

  return { fichaDoc };
})();
