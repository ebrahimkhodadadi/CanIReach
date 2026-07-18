# Diagnostics Details

CanIReach runs a multi-layered diagnostic check for each target endpoint. Understanding how these checks execute helps you isolate network errors.

---

## 🔍 Diagnostic Hops & Execution Phases

When a probe is triggered, the engine resolves the target through the following sequential layers:

```
[Target URL]
     │
     ▼
[1. DNS Resolve] ───► Resolves domain to IP (IPv4/IPv6 preference).
     │
     ▼
[2. TCP Connect] ───► Verifies port access (port 80/443 default).
     │
     ▼
[3. TLS Handshake] ─► Performs SSL/TLS verification (when secure).
     │
     ▼
[4. HTTP Request] ──► Checks headers, user-agent, redirects, and status.
```

### 1. DNS Name Resolution
* Queries system resolver threads to convert domain hostnames (e.g. `github.com`) into routable IP addresses.
* Respects IP preference options: "Prefer IPv4", "Prefer IPv6", or "System default".
* Error codes: `DnsError` (name could not be resolved, offline state, or server NXDOMAIN).

### 2. TCP Socket Connections
* Establishes a raw TCP handshake connection with the resolved remote endpoint IP on the specified port.
* Error codes: `ConnectError` (port closed, socket refused, or connection timeout).

### 3. Secure TLS Handshakes
* Negotiates SSL/TLS security protocols (for `https://` URLs) to verify certificate validity, domain matches, and signature authority.
* Respects TLS config choices, including "Verify SSL Certificates".
* Error codes: `TlsError` (expired certificates, certificate name mismatches, self-signed warnings).

### 4. HTTP Protocol Transactions
* Issues the HTTP request (e.g., `GET` or `HEAD`) with configured Headers and User-Agent strings.
* Parses response codes (`200 OK`, `302 Found`, `404 Not Found`, etc.) and payload body lengths.
* Error codes: `HttpError` (invalid HTTP status, protocol violations, empty server responses).

---

## 🔁 Manual HTTP Redirect Resolution

Unlike default HTTP clients which automatically follow redirects, the CanIReach prober intercepts every redirection status code (`301`, `302`, `303`, `307`, `308`). 

* **Isolation**: The prober tracks each redirection hop step-by-step, collecting response headers, target locations, and HTTP codes for each hop.
* **Loop Protection**: Keeps a counter of redirection hops. If the count exceeds the configured limit (e.g. `10`), execution is halted with a `RedirectLimitExceeded` error to prevent infinite redirect loops.

---

## 🗺️ Traceroute Logic

The path traceroute service issues packets with increasing Time-To-Live (TTL) headers:

1. Sends UDP/ICMP packets with a TTL of `1`.
2. The first router decrements the TTL to `0`, drops the packet, and returns a `Time Exceeded` ICMP message.
3. The engine records the router IP, hostname, and round-trip latency.
4. Increments the TTL by `1` and repeats the process until the destination host is reached or the maximum hop count (default `30`) is hit.
