"""Service layer carved out of server.py.

Each module owns one integration or domain concern:

    mail          Resend transport, outbox worker, janitor, template engine
    canada_post   rating, label/manifest generation, delivery tracking sync
    interac       Microsoft Graph polling and e-Transfer auto-confirmation
    nowpayments   crypto invoices, IPN handling, mass payouts
    affiliate     tiers, referral attribution, coupon aliases, payouts
    stock         atomic reservation/release, restock, low-stock alerts

Services reach configuration, the Mongo handle, and anything still living in
server.py through ``server`` (imported as ``s``). server.py registers itself in
``sys.modules`` under both ``server`` and ``backend.server``, so importing a
service works from either entrypoint, and it re-exports the service symbols its
own code and ``routers/`` still resolve by bare name.

Outbound side effects — provider HTTP calls, email sends, stock mutations — and
the predicates that steer them are always invoked as ``s.<name>``, even from
inside the owning module. That keeps server.py the single namespace where a
caller can substitute them.
"""
