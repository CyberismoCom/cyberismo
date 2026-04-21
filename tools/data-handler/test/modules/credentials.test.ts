import { describe, expect, it } from 'vitest';

import { buildRemoteUrl } from '../../src/modules/credentials.js';

describe('modules/credentials', () => {
  it('leaves a public HTTPS URL unchanged when no credentials are provided', () => {
    const url = buildRemoteUrl({
      location: 'https://example.com/repo.git',
      private: false,
    });
    expect(url).toBe('https://example.com/repo.git');
  });

  it('injects username and token into a private HTTPS URL', () => {
    const url = buildRemoteUrl(
      { location: 'https://example.com/repo.git', private: true },
      { username: 'u', token: 't' },
    );
    expect(url).toBe('https://u:t@example.com/repo.git');
  });

  it('preserves the path when injecting credentials', () => {
    const url = buildRemoteUrl(
      {
        location: 'https://git.example.com/group/project.git',
        private: true,
      },
      { username: 'alice', token: 'secret' },
    );
    expect(url).toBe('https://alice:secret@git.example.com/group/project.git');
  });

  it('does not inject credentials into an SSH URL', () => {
    const sshUrl = 'git@github.com:foo/bar.git';
    const url = buildRemoteUrl(
      { location: sshUrl, private: true },
      { username: 'u', token: 't' },
    );
    expect(url).toBe(sshUrl);
  });

  it('passes a file: URL through verbatim', () => {
    const fileUrl = 'file:/some/path/to/module';
    const url = buildRemoteUrl({ location: fileUrl, private: false });
    expect(url).toBe(fileUrl);
  });

  it('returns the original URL when private is true but no credentials are supplied', () => {
    // Auth may happen out-of-band (SSH agent, credential helper); don't invent values.
    const url = buildRemoteUrl({
      location: 'https://example.com/repo.git',
      private: true,
    });
    expect(url).toBe('https://example.com/repo.git');
  });

  it('returns the original URL when credentials are partial (username only)', () => {
    const url = buildRemoteUrl(
      { location: 'https://example.com/repo.git', private: true },
      { username: 'u' },
    );
    expect(url).toBe('https://example.com/repo.git');
  });

  it('throws a clear message on a malformed private HTTPS URL', () => {
    // A hostless URL must surface a descriptive error, not a generic TypeError.
    expect(() =>
      buildRemoteUrl(
        { location: 'https://', private: true },
        { username: 'u', token: 't' },
      ),
    ).toThrow(/Invalid repository URL/);
  });
});
