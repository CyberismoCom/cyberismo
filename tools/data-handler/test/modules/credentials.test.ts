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

  describe('edge cases', () => {
    it('strips embedded auth from the source URL when credentials are supplied — no double-injection', () => {
      // The embedded user:oldtoken@ is parsed away by new URL(); the supplied
      // credentials replace it entirely.  No double-@ appears in the result.
      const url = buildRemoteUrl(
        { location: 'https://user:oldtoken@host/repo.git', private: true },
        { username: 'newuser', token: 'newtoken' },
      );
      expect(url).toBe('https://newuser:newtoken@host/repo.git');
    });

    it('strips embedded username (no password) from the source URL when credentials are supplied', () => {
      const url = buildRemoteUrl(
        { location: 'https://user@host/repo.git', private: true },
        { username: 'newuser', token: 'newtoken' },
      );
      expect(url).toBe('https://newuser:newtoken@host/repo.git');
    });

    it('preserves a non-standard port in the host segment', () => {
      const url = buildRemoteUrl(
        { location: 'https://host:8443/repo.git', private: true },
        { username: 'u', token: 't' },
      );
      expect(url).toBe('https://u:t@host:8443/repo.git');
    });

    it('produces a broken URL when the token contains @', () => {
      // buildRemoteUrl does not percent-encode the token before interpolation.
      // libcurl uses first-@-wins, so `u:tok` becomes the userinfo and
      // `en@host` resolves as the host — a guaranteed connection failure.
      // Tokens containing @ are not safe; the function should percent-encode.
      const url = buildRemoteUrl(
        { location: 'https://host/repo.git', private: true },
        { username: 'u', token: 'tok@en' },
      );
      expect(url).toBe('https://u:tok@en@host/repo.git');
    });

    it('produces a non-standard but functional URL when the token contains :', () => {
      // libcurl treats everything between the first : and the @ as the
      // password, so colon-containing tokens reach the server intact.
      // Non-standard but not broken.
      const url = buildRemoteUrl(
        { location: 'https://host/repo.git', private: true },
        { username: 'u', token: 'tok:en' },
      );
      expect(url).toBe('https://u:tok:en@host/repo.git');
    });

    it('returns an unusable URL when the token contains /', () => {
      // The interpolated string https://u:tok/en@host/repo.git is not a valid
      // URL: libcurl parses `u` as host and `tok` as port, failing with
      // "Port number was not a decimal number…". The function should
      // percent-encode the token.
      const url = buildRemoteUrl(
        { location: 'https://host/repo.git', private: true },
        { username: 'u', token: 'tok/en' },
      );
      expect(url).toBe('https://u:tok/en@host/repo.git');
    });

    it('silently drops the query string from a source URL with a query component', () => {
      // repoUrl.pathname does not include search params; they are lost.
      const url = buildRemoteUrl(
        { location: 'https://host/repo.git?foo=bar', private: true },
        { username: 'u', token: 't' },
      );
      expect(url).toBe('https://u:t@host/repo.git');
    });

    it('silently drops the fragment from a source URL with a hash component', () => {
      // repoUrl.pathname does not include the fragment; it is lost.
      const url = buildRemoteUrl(
        { location: 'https://host/repo.git#frag', private: true },
        { username: 'u', token: 't' },
      );
      expect(url).toBe('https://u:t@host/repo.git');
    });
  });
});
