import { SERVICES, formatMoney } from './domain.mjs';

const show = value => value === null || value === undefined || value === '' ? '—' : String(value);
const serviceLabel = key => SERVICES.find(item => item.key === key)?.label || key;
const money = amount => amount === null || amount === undefined ? '—' : formatMoney(amount);
const tripText = trip => {
  if (!trip) return 'Non presente';
  const extras = (trip.services || []).map(key => serviceLabel(key) + ' ' + money(trip.extraCents?.[key])).join(', ') || 'nessuno';
  return [trip.date, trip.container, trip.client, trip.city,
    'Trasferta ' + money(trip.fareCents), 'Extra: ' + extras,
    trip.secondClient ? 'Seconda presa: ' + trip.secondClient + ' / ' + trip.secondCity : '',
    trip.note ? 'Note: ' + trip.note : ''].filter(Boolean).join(' · ');
};

/** Human-readable, read-only conflict preview; never exposes archive data outside the device. */
export function describeBackupConflict(path, current, imported) {
  if (path === 'profile.firstName' || path === 'profile.lastName') {
    const key = path.slice(8);
    return { title: key === 'firstName' ? 'Nome del profilo' : 'Cognome del profilo',
      current: show(current.profile[key]), backup: show(imported.profile[key]), allowBoth: false };
  }
  if (path.startsWith('extraRates.')) {
    const key = path.slice(11);
    if (!Object.hasOwn(current.extraRates, key)) return null;
    return { title: 'Servizio extra: ' + serviceLabel(key),
      current: money(current.extraRates[key]), backup: money(imported.extraRates[key]), allowBoth: false };
  }
  if (path.startsWith('customers[')) {
    for (const customer of current.customers) for (const field of ['city', 'address', 'vat']) {
      if (path === `customers[${customer.name}].${field}`) {
        const original = imported.customers.find(row => row.name === customer.name);
        if (!original) return null;
        const label = { city: 'Località', address: 'Indirizzo', vat: 'Partita IVA' }[field];
        return { title: customer.name + ' · ' + label, current: show(customer[field]),
          backup: show(original[field]), allowBoth: false };
      }
    }
  }
  if (path.startsWith('tariffs[')) {
    for (const rate of current.tariffs) {
      if (path !== `tariffs[${rate.client}/${rate.city}].cents`) continue;
      const original = imported.tariffs.find(row => row.client === rate.client && row.city === rate.city);
      if (!original) return null;
      return { title: 'Tariffa: ' + rate.client + ' · ' + rate.city,
        current: money(rate.cents), backup: money(original.cents), allowBoth: false };
    }
  }
  if (path.startsWith('trips[') && path.endsWith(']')) {
    const id = path.slice(6, -1);
    const onDevice = current.trips.find(row => row.id === id);
    const inBackup = imported.trips.find(row => row.id === id);
    if (!onDevice || !inBackup) return null;
    const distinct = ['date', 'container', 'client', 'city'].some(key => onDevice[key] !== inBackup[key]);
    return { title: 'Viaggio con identificativo ' + id, current: tripText(onDevice),
      backup: tripText(inBackup), allowBoth: distinct };
  }
  return null;
}
