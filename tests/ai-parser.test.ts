import { describe, expect, it } from 'vitest';
import { formatFlightRoute, formatFlightTitle, formatTimeHHmm, getFlightDestinationAddress, parseFlightText, parseItineraryNote } from '../lib/ai-parser';

describe('parseFlightText', () => {
  it('extracts a StarLux booking message into normalized flight fields', () => {
    const result = parseFlightText(
      '\u661f\u5b87\u822a\u7a7a JX800，2026/10/12 08:30 \u6843\u5712\u570b\u969b\u6a5f\u5834 (TPE) \u8d77\u98db，12:30 \u62b5\u9054\u6771\u4eac\u6210\u7530\u6a5f\u5834 (NRT)，\u78ba\u8a8d\u78bc ABC123',
    );

    expect(result).toMatchObject({
      airlineCode: 'JX',
      airlineName: '\u661f\u5b87\u822a\u7a7a',
      flightNumber: 'JX800',
      departureDate: '2026-10-12',
      departureTime: '08:30',
      arrivalDate: '2026-10-12',
      arrivalTime: '12:30',
      departureAirport: 'TPE',
      arrivalAirport: 'NRT',
      confirmationCode: 'ABC123',
    });
  });

  it('normalizes common Taiwan airline names and separated flight codes', () => {
    expect(parseFlightText('\u9577\u69ae BR 108 \u822a\u73ed'))?.toMatchObject({
      airlineCode: 'BR',
      airlineName: '\u9577\u69ae\u822a\u7a7a',
      flightNumber: 'BR108',
    });
    expect(parseFlightText('\u83ef\u822a CI 101'))?.toMatchObject({
      airlineCode: 'CI',
      airlineName: '\u4e2d\u83ef\u822a\u7a7a',
      flightNumber: 'CI101',
    });
  });

  it('returns null when no flight number can be identified', () => {
    expect(parseFlightText('\u660e\u5929\u642d\u9ad8\u9435\u5230\u53f0\u4e2d')).toBeNull();
  });
});

describe('formatFlightTitle', () => {
  it('combines airline, flight number, and route when airports are available', () => {
    expect(formatFlightTitle({
      airlineName: '\u661f\u5b87\u822a\u7a7a',
      flightNumber: 'JX800',
      departureAirport: 'TPE',
      arrivalAirport: 'NRT',
    })).toBe('\u661f\u5b87\u822a\u7a7a JX800 (TPE \u2794 NRT)');
  });

  it('formats a route for reuse in the address field', () => {
    expect(formatFlightRoute({ departureAirport: '\u53f0\u5317\u6843\u5712', arrivalAirport: '\u6771\u4eac\u6210\u7530' })).toBe('\u53f0\u5317\u6843\u5712 \u2192 \u6771\u4eac\u6210\u7530');
    expect(formatFlightRoute({ departureAirport: null, arrivalAirport: 'NRT' })).toBeNull();
  });

  it('falls back to the flight number when airline or route data is missing', () => {
    expect(formatFlightTitle({ airlineName: null, flightNumber: 'BR108', departureAirport: null, arrivalAirport: null })).toBe('BR108');
  });

  it('supports Chinese airport and city routes in flight text', () => {
    const result = parseFlightText('\u661f\u5b87 JX800 \u53f0\u5317\u6843\u5712 \u5230 \u6771\u4eac\u6210\u7530');

    expect(result).toMatchObject({
      departureAirport: '\u53f0\u5317\u6843\u5712',
      arrivalAirport: '\u6771\u4eac\u6210\u7530',
    });
    expect(formatFlightTitle(result!)).toBe('\u661f\u5b87\u822a\u7a7a JX800 (TPE \u2794 NRT)');
  });

  it('accepts 至 as a Chinese route separator', () => {
    expect(parseFlightText('\u9577\u69ae BR108 \u6843\u5712 \u81f3 \u6210\u7530')).toMatchObject({
      departureAirport: '\u6843\u5712',
      arrivalAirport: '\u6210\u7530',
    });
  });

  it('parses ellipsis-separated Chinese flight routes and calculates duration', () => {
    const result = parseFlightText('台北...飛往大阪...06:30~10:10...BR178');

    expect(result).toMatchObject({
      airlineName: '長榮航空',
      flightNumber: 'BR178',
      departureTime: '06:30',
      arrivalTime: '10:10',
      departureAirport: '台北',
      arrivalAirport: '大阪',
      durationMinutes: 220,
    });
    expect(formatFlightTitle(result!)).toBe('長榮航空 BR178 (TPE ➔ KIX)');
    expect(getFlightDestinationAddress(result!)).toBe('關西國際機場');
  });

  it('never uses a bare IATA route as the destination address', () => {
    expect(getFlightDestinationAddress({ arrivalAirport: 'KIX' })).toBe('關西國際機場');
    expect(getFlightDestinationAddress({ arrivalAirport: 'ZZZ' })).toBeNull();
  });
});

describe('formatTimeHHmm', () => {
  it('normalizes optional seconds and single-digit hours', () => {
    expect(formatTimeHHmm('8:05:00')).toBe('08:05');
    expect(formatTimeHHmm('08:30')).toBe('08:30');
  });

  it('returns null for invalid clock values', () => {
    expect(formatTimeHHmm('25:00:00')).toBeNull();
    expect(formatTimeHHmm(null)).toBeNull();
  });
});

describe('parseItineraryNote', () => {
  it('parses a relative afternoon note and extracts the destination', () => {
    const result = parseItineraryNote('\u660e\u5929\u4e0b\u53482\u9ede\u53bb\u5403\u9957\u98df\u5929\u5802', { referenceDate: '2026-09-04' });

    expect(result).toMatchObject({
      date: '2026-09-05',
      time: '14:00',
      locationName: '\u9957\u98df\u5929\u5802',
    });
  });

  it('supports half-hour evening expressions and explicit month/day dates', () => {
    expect(parseItineraryNote('\u5f8c\u5929\u665a\u4e0a7\u9ede\u534a，\u53bb\u53f0\u5317101', { referenceDate: '2026-09-04' }))?.toMatchObject({
      date: '2026-09-06',
      time: '19:30',
      locationName: '\u53f0\u5317101',
    });
    expect(parseItineraryNote('10/12 \u4e0a\u53489:30 \u53c3\u89c0\u6545\u5bae', { referenceDate: '2026-09-04' }))?.toMatchObject({
      date: '2026-10-12',
      time: '09:30',
      locationName: '\u6545\u5bae',
    });
  });

  it('returns null when neither a date/time nor a place is present', () => {
    expect(parseItineraryNote('\u8a18\u5f97\u5e36\u96e8\u5098', { referenceDate: '2026-09-04' })).toBeNull();
  });
});
