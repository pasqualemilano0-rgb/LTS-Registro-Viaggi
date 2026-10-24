import { monthlyTrips, SERVICES } from './domain.mjs';

const SERVICE_LABELS = Object.fromEntries(SERVICES.map(service => [service.key, service.label]));
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
let logoPromise;

/** Load ahead of the share gesture; the PDF itself stays entirely on the device. */
export function loadPdfLogo(url = '/LTS-Registro-Viaggi/effeerre/assets/effeerre-logo-pdf.png') {
  if (!logoPromise) logoPromise = fetch(url).then(response => {
    if (!response.ok) throw new Error('Logo aziendale non disponibile. Riprova.');
    return response.blob();
  }).then(blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Impossibile leggere il logo aziendale.'));
    reader.readAsDataURL(blob);
  })).catch(error => { logoPromise = null; throw error; });
  return logoPromise;
}

function monthlyLabel(month) {
  const [year, number] = month.split('-');
  return `${MONTHS[Number(number) - 1]} ${year}`;
}

function displayDate(date) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

/** Explicit allowlist: monetary data is never copied into a report row. */
export function reportRows(state, month) {
  return monthlyTrips(state, month).map(trip => [
    displayDate(trip.date),
    trip.container,
    trip.secondCity ? `1. ${trip.city}\n2. ${trip.secondCity}` : trip.city,
    trip.secondClient ? `1. ${trip.client}\n2. ${trip.secondClient}` : trip.client,
    trip.services.map(service => SERVICE_LABELS[service]).filter(Boolean).join('\n') || '—',
  ]);
}

function fitFont(doc, rows, widths, availableHeight) {
  // Prefer one readable A4 page, then permit additional pages rather than tiny text.
  for (const fontSize of [9.1, 8.3, 7.5]) {
    doc.setFontSize(fontSize);
    const rowHeight = row => Math.max(...row.map((cell, index) => {
      doc.setFont('helvetica', index === 1 ? 'bold' : 'normal');
      return doc.splitTextToSize(String(cell), widths[index] - 4).length;
    })) * fontSize * 1.15 / 2.83465 + 3.2;
    if (rows.reduce((sum, row) => sum + rowHeight(row), 0) <= availableHeight) return fontSize;
  }
  return 7.5;
}

/** No currency or tariff snapshots are sent to jsPDF, including PDF metadata. */
export function generateMonthlyPdf({ state, month, logoDataUrl, jsPDF = globalThis.jspdf?.jsPDF }) {
  const rows = reportRows(state, month);
  if (!rows.length) throw new Error('Non ci sono viaggi nel mese selezionato.');
  if (rows.length > 5000) throw new Error('Il mese contiene oltre 5.000 viaggi: genera il resoconto da un computer.');
  const driver = `${state.profile.firstName ?? ''} ${state.profile.lastName ?? ''}`.trim();
  if (!driver) throw new Error('Completa il nome e cognome autista nel profilo.');
  if (typeof jsPDF !== 'function') throw new Error('Generatore PDF non disponibile. Riapri l’app e riprova.');
  if (!logoDataUrl) throw new Error('Caricamento del logo in corso. Riprova tra un istante.');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  if (typeof doc.autoTable !== 'function') throw new Error('Generatore tabella PDF non disponibile.');
  doc.setProperties({ title: `Registro viaggi ${monthlyLabel(month)}`, subject: 'Resoconto mensile dei viaggi effettuati', author: driver, creator: 'EFFE.ERRE TRASPORTI Registro Viaggi' });
  const widths = [20, 35, 39, 49, 45];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const driverLines = doc.splitTextToSize(driver, 132);
  const tableTop = Math.max(40, 26 + (driverLines.length - 1) * 9 * 1.1 / 2.83465 + 11);
  const fontSize = fitFont(doc, rows, widths, 272 - tableTop);
  const image = doc.getImageProperties(logoDataUrl);
  const drawHeader = () => {
    const logoScale = Math.min(39 / image.width, 20 / image.height);
    const logoWidth = image.width * logoScale;
    const logoHeight = image.height * logoScale;
    doc.addImage(logoDataUrl, 'PNG', 199 - logoWidth, 10, logoWidth, logoHeight, 'effeerre-company-logo', 'FAST');
    doc.setTextColor('#343A40');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('REGISTRO VIAGGI', 11, 14, { align: 'left' });
    doc.setFontSize(10);
    doc.text(monthlyLabel(month).toLocaleUpperCase('it-IT'), 11, 20, { align: 'left' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(driverLines, 11, 26, { align: 'left', lineHeightFactor: 1.1 });
    doc.setDrawColor('#56616B');
    doc.setLineWidth(0.65);
    doc.line(11, tableTop - 4, 199, tableTop - 4);
  };
  doc.autoTable({
    startY: tableTop,
    margin: { top: tableTop, right: 11, bottom: 15, left: 11 },
    head: [['DATA', 'CONTAINER', 'CITTÀ', 'CLIENTE', 'SERVIZI']],
    body: rows,
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    styles: { font: 'helvetica', fontSize, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 }, lineColor: '#DADFE3', lineWidth: 0.15, textColor: '#343A40', valign: 'top', overflow: 'linebreak', minCellHeight: 6.5 },
    headStyles: { fillColor: '#56616B', textColor: '#ffffff', fontStyle: 'bold', fontSize: 8, cellPadding: 2 },
    alternateRowStyles: { fillColor: '#F3F4F5' },
    columnStyles: Object.fromEntries(widths.map((width, index) => [index, { cellWidth: width, ...(index === 1 ? { fontStyle: 'bold' } : {}) }])),
    willDrawPage: drawHeader,
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor('#6F7C87');
    doc.text(`${rows.length} ${rows.length === 1 ? 'viaggio' : 'viaggi'} • ${monthlyLabel(month)}`, 11, 289);
    doc.text(`Pagina ${page} di ${pages}`, 199, 289, { align: 'right' });
  }
  return { blob: doc.output('blob'), fileName: `EFFE.ERRE-Viaggi-${month}.pdf`, pages, tripCount: rows.length };
}

/** Invoke directly from a button to retain Safari's transient user activation. */
export async function shareOrDownloadPdf(report) {
  if (!(report?.blob instanceof Blob)) throw new Error('Genera prima il PDF.');
  const file = new File([report.blob], report.fileName, { type: 'application/pdf' });
  let canShare = false;
  try { canShare = Boolean(globalThis.navigator?.share && globalThis.navigator?.canShare?.({ files: [file] })); } catch { /* Download remains available. */ }
  if (canShare) {
    try {
      await navigator.share({ files: [file], title: 'EFFE.ERRE Registro Viaggi' });
      return 'shared';
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelled';
      // A browser can support canShare but still reject sharing in a web view.
    }
  }
  const url = URL.createObjectURL(report.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = report.fileName;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  return 'downloaded';
}
