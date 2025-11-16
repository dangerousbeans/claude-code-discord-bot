import { describe, it, expect } from 'vitest';
import { detectScreenshotUrl } from '../../src/services/screenshot.js';

describe('Screenshot Service', () => {
  describe('detectScreenshotUrl', () => {
    it('should detect localhost with port', () => {
      const text = 'Server running on localhost:3000';
      const url = detectScreenshotUrl(text);
      expect(url).toBe('http://localhost:3000');
    });

    it('should detect 127.0.0.1 with port', () => {
      const text = 'Visit 127.0.0.1:8080 to see the app';
      const url = detectScreenshotUrl(text);
      expect(url).toBe('http://localhost:8080');
    });

    it('should detect 0.0.0.0 with port', () => {
      const text = 'Listening on 0.0.0.0:5000';
      const url = detectScreenshotUrl(text);
      expect(url).toBe('http://localhost:5000');
    });

    it('should detect http://localhost URLs', () => {
      const text = 'Open http://localhost:4200 in your browser';
      const url = detectScreenshotUrl(text);
      expect(url).toBe('http://localhost:4200');
    });

    it('should detect http://localhost URLs with paths', () => {
      const text = 'Navigate to http://localhost:3000/dashboard';
      const url = detectScreenshotUrl(text);
      expect(url).toBe('http://localhost:3000/dashboard');
    });

    it('should return null for non-localhost URLs', () => {
      const text = 'Visit https://example.com';
      const url = detectScreenshotUrl(text);
      expect(url).toBeNull();
    });

    it('should return null for text without URLs', () => {
      const text = 'Just some regular text';
      const url = detectScreenshotUrl(text);
      expect(url).toBeNull();
    });

    it('should detect first localhost URL in text with multiple URLs', () => {
      const text = 'Server at localhost:3000 and backup at localhost:3001';
      const url = detectScreenshotUrl(text);
      expect(url).toBe('http://localhost:3000');
    });

    it('should handle case insensitive matching', () => {
      const text = 'Server on LOCALHOST:8000';
      const url = detectScreenshotUrl(text);
      expect(url).toBe('http://localhost:8000');
    });
  });
});
