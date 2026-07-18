# Proxy & Network Selection Reference

CanIReach supports advanced connection profiles, allowing you to route diagnostic checks through proxy tunnels or specific local network interfaces.

---

## 🌐 Network Connection Profiles

Network Profiles define how the prober communicates with target servers. You can create profiles under **Settings -> Network Profiles**:

### 1. Direct (No Proxy)
* Queries are sent directly through your operating system's default network routing tables and gateway interfaces.

### 2. HTTP Proxies
* Routes diagnostic HTTP/HTTPS requests through an intermediate HTTP proxy server.
* Support format: `http://[username:password@]host:port`

### 3. SOCKS5 & SOCKS5H Tunnels
* Routes raw connection socket streams through SOCKS5 proxy endpoints.
* **SOCKS5**: Domain names are resolved locally by the client machine before connection routing.
* **SOCKS5H**: Domain names are passed directly to the SOCKS5 proxy, which performs the DNS resolution. This is recommended to prevent local DNS leakages.

---

## 🎛️ Network Profile Mapping Options

Profiles can be scoped globally or applied to individual targets:

* **System Default Profile**: When marked as default, all endpoints that do not have a custom profile assigned are routed through this profile automatically.
* **Target-Specific Profile Overrides**: You can edit a target's configuration and assign it a specific network profile. This is useful to verify if specific servers are accessible via a VPN/proxy but blocked directly.
