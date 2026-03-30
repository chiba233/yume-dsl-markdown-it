# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, report them privately via one of the following:

- **GitHub private vulnerability reporting**: Go to the [Security](https://github.com/chiba233/yume-dsl-markdown-it/security/advisories/new) tab and click "Report a vulnerability".
- **Email**: Send details to the repository maintainer (see GitHub profile).

### What to include

1. Description of the vulnerability
2. Steps to reproduce
3. Affected version
4. Impact assessment (if known)

### What to expect

- Acknowledgment within **48 hours**
- Status update within **7 days**
- A fix or mitigation plan for confirmed vulnerabilities

## Scope

This policy covers `yume-dsl-markdown-it`. It does **not** cover:

- Vulnerabilities in rendering layers you build on top of the plugin (that's your application code)
- Denial of service via extremely large input — use input size limits in your application

## Known security considerations

- **HTML escaping**: The plugin wraps `createText` with `md.utils.escapeHtml` by default. Your `ruleset.createText` should return un-escaped plain text; the plugin handles escaping.
- **Render failure**: By default, failed DSL fragments are preserved as escaped source text (`onRenderFailure: "preserve"`). If you switch to a custom handler, ensure it escapes user-controlled content.
- **Handler safety**: Walker handlers are application code. If they output HTML attributes or inject URLs, validate and escape at that layer.
