/** Prepare a fresh journey from an existing route; never duplicate a saved trip. */
export function quickTripFromRoute(trip, date) {
  if (!trip || typeof trip !== 'object' ||
      typeof trip.client !== 'string' || typeof trip.city !== 'string' ||
      !trip.client.trim() || !trip.city.trim()) {
    throw new TypeError('Il viaggio di partenza non contiene un percorso valido.');
  }
  if (typeof date !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(date)) {
    throw new TypeError('La data del nuovo viaggio non è valida.');
  }
  const secondClient = typeof trip.secondClient === 'string' ? trip.secondClient : '';
  const secondCity = typeof trip.secondCity === 'string' ? trip.secondCity : '';
  const second = Boolean(secondClient.trim() && secondCity.trim());
  return {
    date,
    client: trip.client,
    city: trip.city,
    container: '',
    secondClient: second ? secondClient : '',
    secondCity: second ? secondCity : '',
    second,
    // Extra, amounts, old notes, identities and timestamps are never inherited.
    services: [],
    note: '',
    noteOpen: false,
    servicesOpen: false
  };
}
