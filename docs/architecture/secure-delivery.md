# Secure delivery

Delivery packages bind recipients to an immutable report version and immutable asset generations. API commands create and transition packages; browsers never write package records or final objects directly. Public delivery must resolve agency identity from a verified host and signed session, store only token/passcode hashes, enforce expiry and rate limits, and audit send/open/download/revoke events.

The current repository contains the delivery domain, guarded workflow, API, Storage boundary and Service Operations queue. Public token exchange is intentionally not activated until tenant identity, no-response, sender and retention policies are approved. Never expose raw object paths as public bearer links.
