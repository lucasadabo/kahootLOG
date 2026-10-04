import { describe, expect, it } from 'vitest';
import { analyticsRoute, prepareAnalyticsPrivacy, sanitizePageview, sanitizeReferrer } from '../lib/analyticsPrivacy';

describe('analytics privacy', () => {
  it('only reports known static routes, without query or fragment', () => {
    for (const path of ['/', '/join', '/admin', '/perguntas']) {
      expect(sanitizePageview({ type: 'pageview', url: `https://fr.adabo.com.br${path}?pin=123456&nickname=fixture&token=fixture#player-fixture` }))
        .toEqual({ type: 'pageview', url: `https://fr.adabo.com.br${path}` });
    }
  });
  it('blocks custom events, unknown paths, foreign hosts and malformed URLs', () => {
    expect(sanitizePageview({ type: 'event', url: 'https://fr.adabo.com.br/' })).toBeNull();
    for (const url of ['https://fr.adabo.com.br/room/123456', 'https://fr.adabo.com.br/player/fixture', 'https://preview.vercel.app/', 'invalid']) {
      expect(sanitizePageview({ type: 'pageview', url })).toBeNull();
    }
    expect(analyticsRoute('/join/123456')).toBeNull();
  });
  it('does not preserve arbitrary payloads', () => {
    const event = { type: 'pageview' as const, url: 'https://fr.adabo.com.br/', payload: { nickname: 'fixture' } };
    expect(sanitizePageview(event)).toEqual({ type: 'pageview', url: 'https://fr.adabo.com.br/' });
  });
  it('keeps only the referring origin', () => {
    expect(sanitizeReferrer('https://user:secret@adabo.com.br/room/123456?token=fixture#nickname')).toBe('https://adabo.com.br/');
    for (const value of ['', 'invalid', 'file:///secret']) expect(sanitizeReferrer(value)).toBe('');
  });
  it('prepares the document and fails closed when redaction is blocked', () => {
    const doc = { referrer: 'https://adabo.com.br/player/fixture?pin=123456' } as Document;
    expect(prepareAnalyticsPrivacy(doc)).toBe(true);
    expect(doc.referrer).toBe('https://adabo.com.br/');
    expect(prepareAnalyticsPrivacy(Object.freeze({ referrer: 'https://adabo.com.br/secret' }) as Document)).toBe(false);
  });
});
