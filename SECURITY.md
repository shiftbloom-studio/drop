# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private vulnerability reporting (Security tab → "Report a vulnerability") or email **hello@shiftbloom.studio** with "drop security" in the subject. Include steps to reproduce and the impact you see.

We aim to acknowledge reports within 3 working days and to ship a fix or mitigation within 14 days for confirmed issues. We'll credit you in the release notes unless you'd rather stay anonymous.

## Supported versions

Only the latest `main` is supported. Self-hosters should redeploy after security fixes.

## Scope

In scope: authentication bypass, stored XSS on the drop origin, access to other users' delete tokens, SSRF through the asset proxy, and anything that leaks the API token.

Out of scope: rate limiting and DDoS (these belong in your Cloudflare zone configuration), and content that users choose to upload.
