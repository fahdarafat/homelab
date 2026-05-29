# Caddy + caddy-tailscale plugin.
#
# The stock Caddy image has no Tailscale support, so we build a custom binary
# with xcaddy that bundles the plugin, then copy it into the runtime image.
# The plugin lets a single Caddy instance join the tailnet as MANY nodes (one
# per app), each with its own MagicDNS name and automatic *.ts.net HTTPS cert.
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/tailscale/caddy-tailscale

FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
