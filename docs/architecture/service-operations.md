# Service operations

Managed work is represented by a `ServiceOrderRecord`; it does not grant property-management authority. Each order identifies the requester, authoriser where applicable, related property/job/report, service policy, priority, due time and guarded lifecycle. Field attendance, maintenance, comparison, portfolio audit and evidence-pack records remain separate aggregates linked to the order.

All lifecycle changes use named API commands with optimistic versions, audit and outbox events. Terminal attendance requires an outcome. Maintenance completion/verification/closure requires evidence. Evidence-pack approval requires purpose, authorised requester and privacy reviewer. Portfolio findings are operational indicators, not certifications or legal conclusions.
