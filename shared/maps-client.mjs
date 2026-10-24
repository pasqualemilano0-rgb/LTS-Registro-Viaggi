/** Pure Google Maps proposal parsing. This module never fetches or saves data. */
export const MAX_MAPS_LINK_LENGTH = 4096;
const FULL_HOSTS = new Set(['google.com', 'www.google.com', 'google.it', 'www.google.it']);
const MAPS_HOSTS = new Set(['maps.google.com', 'maps.google.it']);
const STREET = /(?:^|[,·|]\s*)(?:VIA|VIALE|PIAZZA|PIAZZALE|CORSO|STRADA|LOCALITÀ|LOCALITA|FRAZIONE|ZONA INDUSTRIALE|LARGO|VICOLO|CONTRADA|SS\s?\d|SP\s?\d)\b/iu;
const ENTITIES = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', ndash: '–', mdash: '—', agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù', Agrave: 'À', Egrave: 'È', Eacute: 'É', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù' });

export function decodeHtmlText(value) {
  return String(value ?? '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (whole, entity) => {
    if (!entity.startsWith('#')) return ENTITIES[entity] ?? whole;
    const code = entity[1]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
  });
}

function clean(value, maximum = 500) {
  return decodeHtmlText(value).normalize('NFC').replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, maximum);
}
function upper(value, maximum) { return clean(value, maximum).toLocaleUpperCase('it-IT'); }
function decoded(value) { try { return decodeURIComponent(value.replace(/\+/gu, ' ')); } catch { return ''; } }
function usefulName(value) {
  const name = clean(value, 500).replace(/<[^>]*>/gu, '').replace(/\s*(?:[-–—|]\s*)?Google Maps\s*$/iu, '').trim();
  return /^(?:Google(?: Maps)?|Maps|Scopri Google Maps|Before you continue|Prima di continuare|Accedi a Google|https?:\/\/|(?:place_id:|cid:|0x)|(?:loc:)?[+\-\d., @]+$)/iu.test(name) ? '' : name;
}

/** Exact allowlist on every outbound hop; no credentials, IPs or custom ports. */
export function checkedGoogleMapsUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_MAPS_LINK_LENGTH || !value.trim()) throw new Error('Incolla un link Google Maps valido.');
  const text = decodeHtmlText(value.trim());
  const candidate = text.match(/https:\/\/[^\s<>"']+/iu)?.[0];
  if (!candidate) throw new Error('Usa un link HTTPS di Google Maps.');
  let url;
  try { url = new URL(candidate); } catch { throw new Error('Il link Google Maps non è valido.'); }
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  const full = FULL_HOSTS.has(host) && (path === '/maps' || path.startsWith('/maps/'));
  const maps = MAPS_HOSTS.has(host) && (path === '/' || path === '/maps' || path.startsWith('/maps/'));
  const short = host === 'maps.app.goo.gl' && /^\/[A-Za-z0-9_-]+\/?$/u.test(path);
  const legacyShort = host === 'goo.gl' && /^\/maps\/[A-Za-z0-9_-]+\/?$/u.test(path);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.href.length > MAX_MAPS_LINK_LENGTH || !(full || maps || short || legacyShort))
    throw new Error('Usa un link HTTPS di Google Maps: google.com/maps, google.it/maps o maps.app.goo.gl.');
  url.hash = '';
  return url;
}

/** Italian locality inference only from a postcode or an explicit province suffix. */
export function cityFromItalianAddress(value) {
  const address = clean(value, 1000).replace(/(?:,\s*|\s+)(?:Italia|Italy)\s*$/iu, '').trim();
  const postcode = /(?:^|[\s,])(?:IT[- ]?)?\d{5}[\s,]+(.+)$/u.exec(address);
  let city = postcode ? postcode[1].split(',')[0].trim() : address.split(',').length > 1 ? address.split(',').at(-1).trim() : '';
  if (!postcode && !/.+\s+(?:\([A-Z]{2}\)|[A-Z]{2})$/iu.test(city)) return '';
  city = city.replace(/\s*\([A-Z]{2}\)\s*$/iu, '').replace(/\s+[A-Z]{2}\s*$/iu, '').trim();
  if (!city || city.length > 100 || /^[A-Z]{2}$/u.test(city) || !/^[\p{L}][\p{L}\p{M} .’'\-]*$/u.test(city) || STREET.test(city) || /^(?:ITALIA|ITALY)$/iu.test(city)) return '';
  return upper(city, 100);
}

function textProposal(value) {
  const text = clean(value, 1500);
  if (!text || /^(?:(?:loc:)?[+\-\d., @]+|place_id:.*|cid:.*|0x.*)$/iu.test(text)) return {};
  const comma = text.indexOf(',');
  if (comma < 0) return { name: usefulName(text), city: '', address: '' };
  const first = text.slice(0, comma).trim();
  if (STREET.test(first)) return { name: '', city: cityFromItalianAddress(text), address: text };
  const address = text.slice(comma + 1).trim();
  return { name: usefulName(first), city: cityFromItalianAddress(address), address };
}

export function proposalFromMapsUrl(value) {
  const url = checkedGoogleMapsUrl(value);
  if (url.pathname.includes('/dir/')) return { name: '', city: '', address: '' };
  const place = /\/place\/([^/]+)/u.exec(url.pathname);
  const query = place ? decoded(place[1]) : url.searchParams.get('query') || url.searchParams.get('q') || '';
  let proposal = textProposal(query);
  // Some public links carry a readable address in !2s; IDs/coordinates are ignored.
  if (!proposal.address) {
    const data = /!2s([^!]+)/u.exec(url.pathname + (url.searchParams.get('data') || ''));
    if (data) {
      const readable = decoded(data[1]);
      if (readable.includes(',')) proposal = { ...textProposal(readable), ...(proposal.name ? { name: proposal.name } : {}) };
    }
  }
  return { name: proposal.name || '', city: proposal.city || '', address: proposal.address || '' };
}

function attributes(tag) {
  const result = {};
  // Requiring a token boundary avoids retrying a long malformed attribute at
  // every character. Values remain plain text and are never inserted as HTML.
  for (const match of tag.matchAll(/(?:^|\s)([a-z][a-z0-9:_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+))/giu)) result[match[1].toLowerCase()] = decodeHtmlText(match[2] ?? match[3] ?? match[4]);
  return result;
}
function* tags(html, tagName, lower = html.toLowerCase()) {
  let cursor = 0;
  while (cursor < html.length) {
    const start = lower.indexOf(`<${tagName}`, cursor);
    if (start < 0) return;
    const afterName = start + tagName.length + 1;
    if (!/[\s/>]/u.test(html[afterName] || '')) { cursor = afterName; continue; }
    const end = html.indexOf('>', afterName);
    if (end < 0) return;
    cursor = end + 1;
    if (end - start > 16384) continue;
    yield { attrs: html.slice(afterName, end), contentStart: end + 1 };
  }
}
function metadata(html, lower) {
  const result = {};
  for (const tag of tags(html, 'meta', lower)) {
    const attrs = attributes(tag.attrs);
    const key = attrs.property || attrs.name || attrs.itemprop;
    if (key && attrs.content && !result[key.toLowerCase()]) result[key.toLowerCase()] = attrs.content;
  }
  return result;
}

function jsonBusiness(value, depth = 0, budget = { remaining: 250 }) {
  if (!value || typeof value !== 'object' || depth > 10 || --budget.remaining < 0) return null;
  if (!Array.isArray(value) && typeof value.name === 'string' && value.address) {
    const address = value.address;
    if (typeof address === 'string') return { name: usefulName(value.name), address: clean(address, 1000), city: cityFromItalianAddress(address) };
    if (address && typeof address === 'object' && !Array.isArray(address)) {
      const street = typeof address.streetAddress === 'string' ? clean(address.streetAddress, 500) : '';
      const postcode = typeof address.postalCode === 'string' ? clean(address.postalCode, 20) : '';
      const locality = typeof address.addressLocality === 'string' ? clean(address.addressLocality, 100) : '';
      const region = typeof address.addressRegion === 'string' ? clean(address.addressRegion, 100) : '';
      const city = locality && /^[\p{L}][\p{L}\p{M} .’'\-]*$/u.test(locality) ? upper(locality, 100) : '';
      const joined = [street, [postcode, locality, region].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      if (joined) return { name: usefulName(value.name), address: joined, city: city || cityFromItalianAddress(joined) };
    }
  }
  for (const child of Object.values(value)) {
    const found = jsonBusiness(child, depth + 1, budget);
    if (found) return found;
  }
  return null;
}

function addressFromDescription(value) {
  const text = clean(value, 2000);
  const parts = text.split(/\s*[·|•]\s*/u);
  const address = parts.find(part => STREET.test(part)) || (STREET.test(text) ? text : '');
  return address ? { address, city: cityFromItalianAddress(address) } : {};
}

function titleProposal(value) {
  const title = usefulName(value);
  const parts = title.split(/\s*[·•|]\s*/u);
  const addressIndex = parts.findIndex(part => STREET.test(part));
  if (addressIndex > 0) {
    const address = parts.slice(addressIndex).join(', ');
    return { name: usefulName(parts.slice(0, addressIndex).join(' · ')), address, city: cityFromItalianAddress(address) };
  }
  const separated = textProposal(title);
  if (separated.address && (STREET.test(separated.address) || /(?:^|\s)\d{5}(?:\s|$)/u.test(separated.address))) return separated;
  return { name: title };
}

/** Extract structured public page hints, without executing scripts or HTML. */
export function proposalFromMapsHtml(html) {
  if (typeof html !== 'string') return {};
  const lower = html.toLowerCase();
  let scripts = 0;
  for (const tag of tags(html, 'script', lower)) {
    if (++scripts > 250) break;
    if (attributes(tag.attrs).type?.toLowerCase() !== 'application/ld+json') continue;
    const end = lower.indexOf('</script', tag.contentStart);
    if (end < 0) break;
    if (end - tag.contentStart > 262144) continue;
    try {
      const business = jsonBusiness(JSON.parse(html.slice(tag.contentStart, end)));
      if (business) return business;
    } catch { /* The URL and public metadata still supply a manual proposal. */ }
  }
  const meta = metadata(html, lower);
  const titleTag = tags(html, 'title', lower).next().value;
  const titleEnd = titleTag ? lower.indexOf('</title', titleTag.contentStart) : -1;
  const titleText = titleEnd >= 0 && titleEnd - titleTag.contentStart <= 4096 ? html.slice(titleTag.contentStart, titleEnd) : '';
  const description = meta['og:description'] || meta.description || meta['twitter:description'] || '';
  const named = [meta['og:title'], meta['twitter:title'], meta.name, titleText].filter(Boolean).map(titleProposal).find(proposal => proposal.name || proposal.address) || {};
  const microAddress = meta.address || [meta.streetaddress, [meta.postalcode, meta.addresslocality, meta.addressregion].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const descriptionHint = addressFromDescription(description);
  const address = (meta.address || meta.streetaddress ? clean(microAddress, 1000) : '') || named.address || descriptionHint.address || '';
  const locality = meta.addresslocality && /^[\p{L}][\p{L}\p{M} .’'\-]*$/u.test(clean(meta.addresslocality, 100)) ? upper(meta.addresslocality, 100) : '';
  const city = locality || cityFromItalianAddress(address) || named.city || descriptionHint.city || '';
  return { name: named.name || '', ...(address ? { address } : {}), ...(city ? { city } : {}) };
}

/** Every output is a proposal: review is required before the UI stores it. */
export function mergeMapsProposal(url, html = '') {
  const link = checkedGoogleMapsUrl(url);
  const inline = proposalFromMapsUrl(link.href);
  const page = proposalFromMapsHtml(html);
  const name = upper(page.name || inline.name, 500);
  const address = upper(page.address || inline.address, 1000);
  const city = upper(page.city || inline.city || cityFromItalianAddress(address), 100);
  const warnings = [];
  if (!name) warnings.push('Il link non indica il nome del cliente: inseriscilo manualmente.');
  if (!city) warnings.push('La città non è disponibile nel link: completala manualmente.');
  if (!address) warnings.push('L’indirizzo non è disponibile nel link: completalo manualmente.');
  warnings.push('Controlla i dati proposti da Google Maps prima di salvare.');
  return { name, city, address, url: link.href, warnings };
}
