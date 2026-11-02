/* Générateur de fichiers Excel (.xlsx) sans bibliothèque externe. S'ouvre dans Excel, Google Sheets, LibreOffice, Numbers.
   Usage : XlsxLite.build([{ name, header:[...], widths:[...], fmts:[...], rows:[[...]], plain:false }]) -> Uint8Array
   Formats de colonne : text, date (valeur 'AAAA-MM-JJ'), num (0,00), money (0,00 €), pct (0,0 %), int.
   Une cellule peut aussi être un objet { v, f, b } (valeur, format, gras). */
(function () {
  const enc = new TextEncoder();
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

  function zip(files) {
    const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
    const parts = [], central = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      const lh = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
      parts.push(lh, name, data);
      central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name);
      off += lh.length + name.length + data.length;
    }
    const csize = central.reduce((s, a) => s + a.length, 0);
    const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(csize), ...u32(off), ...u16(0)]);
    const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((s, a) => s + a.length, 0)); let p = 0;
    for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  }

  const X = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const col = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  // index du style (cellXfs) selon le format ; version grasse = +5 pour money/pct/int, 7 pour le texte
  const STYLE = { text: 0, date: 2, num: 3, money: 4, pct: 5, int: 6 };
  const BOLD = { text: 7, money: 8, int: 9, pct: 10, num: 7 };
  const serial = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) + 25569 : null; };

  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00\\ &quot;€&quot;"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="11">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="1" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="166" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function cell(v, fmt, ref) {
    let f = fmt || 'text', bold = false;
    if (v && typeof v === 'object' && !Array.isArray(v)) { f = v.f || f; bold = !!v.b; v = v.v; }
    if (v === '' || v == null) return '';
    if (f === 'date') { const sn = serial(v); if (sn != null) return `<c r="${ref}" s="${bold ? 7 : 2}"><v>${sn}</v></c>`; }
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${bold ? (BOLD[f] != null ? BOLD[f] : 7) : (STYLE[f] || 0)}"><v>${v}</v></c>`;
    return `<c r="${ref}"${bold ? ' s="7"' : ''} t="inlineStr"><is><t xml:space="preserve">${X(v)}</t></is></c>`;
  }

  function sheetXml(s, first) {
    const n = s.header.length, rows = s.rows;
    const cols = '<cols>' + (s.widths || s.header.map(() => 14)).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
    const hdr = '<row r="1">' + s.header.map((h, i) => `<c r="${col(i)}1" s="1" t="inlineStr"><is><t xml:space="preserve">${X(h)}</t></is></c>`).join('') + '</row>';
    const body = rows.map((r, ri) => `<row r="${ri + 2}">` + r.map((v, ci) => cell(v, s.fmts && s.fmts[ci], col(ci) + (ri + 2))).join('') + '</row>').join('');
    const view = `<sheetViews><sheetView workbookViewId="0"${first ? ' tabSelected="1"' : ''}>${s.plain ? '' : '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'}</sheetView></sheetViews>`;
    const filt = (!s.plain && rows.length) ? `<autoFilter ref="A1:${col(n - 1)}${rows.length + 1}"/>` : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + view + '<sheetFormatPr defaultRowHeight="15"/>' + cols + `<sheetData>${hdr}${body}</sheetData>` + filt + '</worksheet>';
  }

  function build(sheets) {
    const safe = (n, i) => (String(n || 'Feuille' + (i + 1)).replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31)) || 'Feuille' + (i + 1);
    const files = [];
    files.push({ name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' });
    files.push({ name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
    files.push({ name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets.map((s, i) => `<sheet name="${X(safe(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>' });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` });
    files.push({ name: 'xl/styles.xml', data: STYLES });
    sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s, i === 0) }));
    return zip(files);
  }
  window.XlsxLite = { build };
})();
