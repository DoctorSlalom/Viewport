import { describe, it, expect } from 'vitest';
import { isValidPathSegments } from './route.js';

describe('isValidPathSegments', () => {
  it('allows a normal prototype path', () => {
    expect(isValidPathSegments(['homepage', 'variant-a', 'index.html'])).toBe(true);
  });

  it('allows nested asset paths', () => {
    expect(isValidPathSegments(['homepage', 'variant-a', 'assets', 'style.css'])).toBe(true);
  });

  it('blocks .. traversal', () => {
    expect(isValidPathSegments(['homepage', '..', 'secret'])).toBe(false);
  });

  it('blocks . self-reference', () => {
    expect(isValidPathSegments(['.', 'homepage'])).toBe(false);
  });

  it('blocks null byte injection', () => {
    expect(isValidPathSegments(['homepage\0evil'])).toBe(false);
  });

  it('blocks _-prefixed first segment', () => {
    expect(isValidPathSegments(['_template', 'index.html'])).toBe(false);
  });

  it('blocks dotfile anywhere in path', () => {
    expect(isValidPathSegments(['homepage', '.env'])).toBe(false);
    expect(isValidPathSegments(['.hidden', 'index.html'])).toBe(false);
  });

  it('blocks _-prefixed segment deeper in path', () => {
    // Only first segment is checked for _, but dotfiles anywhere are blocked.
    // A _-prefixed non-first segment is technically allowed by the current rule;
    // this test documents that behaviour.
    expect(isValidPathSegments(['homepage', '_internal'])).toBe(true);
  });
});
