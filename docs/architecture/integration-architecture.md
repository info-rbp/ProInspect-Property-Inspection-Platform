# Integration architecture

`@pcr/integrations` defines provider-neutral records, capability matrices, canonical CSV import, external-reference keys and field-level reconciliation. Provider adapters may map provider fields only at their boundary. Firestore connection records contain a Secret Manager resource reference, scopes, status and cursor; credential material is forbidden.

Inbound and outbound processors must use idempotency keys, provider versions and reconciliation outcomes. Webhooks require signature validation. Polling uses durable cursors. Conflicts marked `manual_review` go to operations and are never overwritten automatically. Add the first provider only after a provider sandbox and contract fixtures are selected.
