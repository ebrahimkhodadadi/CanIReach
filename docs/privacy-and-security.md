# Privacy & Security Policy

CanIReach is designed from the ground up as a private, local-first utility.

---

## 🔒 Privacy Controls

### 1. Local-First Storage
* All target configurations, network profiles, and diagnostic logs are stored directly on your local disk.
* No data is transmitted to external cloud systems, telemetry collectors, or usage analytics servers.

### 2. DNS Leak Protection
* Route traffic via **SOCKS5H** proxy tunnels to ensure that domain name resolutions (DNS) occur directly on the remote proxy server rather than leaking to your local DNS provider.

---

## 🛡️ Security Boundaries

### 1. No TLS MITM Interceptions
* CanIReach performs standard TLS handshakes using system root certificate stores.
* It does not perform intermediate TLS decryption or payload inspections.

### 2. Network Observer Safety
* The connection change observer does not capture packet contents or decode private connection payloads. It only connects a local UDP socket to a public DNS address to read the default routing IP, keeping resource usage light and preserving network privacy.
