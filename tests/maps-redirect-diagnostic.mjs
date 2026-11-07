/** Regression fixture from a verified public Google Maps 302 shortlink.
 * No external request or user credentials required for this deterministic test.
 */
import assert from 'node:assert/strict';
import {checkedGoogleMapsUrl,mergeMapsProposal} from '../shared/maps-client.mjs';
const original='https://maps.app.goo.gl/rC9kQ6YrYGj9gjsU9';
const canonical='https://www.google.com/maps/place/SCARABELLI+-+Europlast,+Via+Romualdo,+55,+70043+Monopoli+BA/data=!4m2!3m1!1s0x1347cb0003a3af73:0xa7cb5d80f05da72a!18m1!1e1';
assert.equal(checkedGoogleMapsUrl(original).hostname,'maps.app.goo.gl');
const verified=checkedGoogleMapsUrl(canonical);
assert.equal(verified.hostname,'www.google.com');
assert.match(verified.pathname,/^\/maps\/place\//u);
const proposal=mergeMapsProposal(verified.href);
assert.equal(proposal.name,'SCARABELLI - EUROPLAST');
assert.equal(proposal.city,'MONOPOLI');
assert.equal(proposal.address,'VIA ROMUALDO, 55, 70043 MONOPOLI BA');
console.log('Google Maps canonical place URL successfully parsed with name, city and street');
