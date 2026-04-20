import { describe, expect, it } from 'vitest';

import { buildRemoteUrl } from '../../src/modules/credentials.js';

// `buildRemoteUrl` is the single injection site for credentialed HTTPS
// remotes (Phase 3 / Phase 5). These tests pin the four corners: public
// HTTPS, private HTTPS, SSH, and file sources.

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
    // Credentials are optional: authentication can still happen out-of-band
    // (e.g. the SSH agent, a credential helper). `buildRemoteUrl` must not
    // invent values.
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
    // The `https:` prefix takes the code path that parses via `new URL(...)`.
    // A URL with no host should trip the parser and surface a descriptive
    // error — not a generic TypeError from WHATWG URL.
    expect(() =>
      buildRemoteUrl(
        { location: 'https://', private: true },
        { username: 'u', token: 't' },
      ),
    ).toThrow(/Invalid repository URL/);
  });
});
