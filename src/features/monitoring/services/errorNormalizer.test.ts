import { describe, it, expect } from "vitest";
import { normalizeError } from "./errorNormalizer";
import { ProbeResult } from "../../probes/types";

describe("errorNormalizer", () => {
  it("should return undefined for successful probes", () => {
    const successResult: ProbeResult = {
      target_id: "google",
      target_url: "https://google.com",
      run_id: "run-1",
      started_at: "2026-07-17T12:00:00Z",
      completed_at: "2026-07-17T12:00:01Z",
      overall_status: "up",
      dns: null,
      tcp: null,
      tls: null,
      http: null,
      ipv4: null,
      ipv6: null,
      redirect: null,
      failure: null,
      timings: { dns_ms: null, tcp_ms: null, tls_ms: null, request_ms: null, total_ms: 100 },
      status: "success",
      failure_stage: "none",
      http_status: 200,
      latency_ms: 100,
      error: null,
      error_code: null,
      timestamp: "2026-07-17T12:00:00Z",
      log: { steps: [] },
      final_url: "https://google.com",
      redirect_count: 0
    };
    expect(normalizeError(successResult)).toBeUndefined();
  });

  it("should normalize DNS failures correctly", () => {
    const dnsFailure: ProbeResult = {
      target_id: "google",
      target_url: "https://google.com",
      run_id: "run-1",
      started_at: "2026-07-17T12:00:00Z",
      completed_at: "2026-07-17T12:00:01Z",
      overall_status: "down",
      dns: {
        stage: "dns",
        started_at: "2026-07-17T12:00:00Z",
        completed_at: "2026-07-17T12:00:01Z",
        duration_ms: 10,
        status: "failed",
        error: {
          stage: "dns",
          kind: "dns_not_found",
          user_message: "DNS resolution failed",
          technical_message: "failed to lookup address information: Host not found",
          error_chain: ["failed to lookup address information: Host not found"],
          errno: null,
          http_status: null,
          address: null,
          protocol: null,
          retryable: true,
          observed_at: "2026-07-17T12:00:01Z",
          confidence: "direct"
        },
        metadata: null
      },
      tcp: null,
      tls: null,
      http: null,
      ipv4: null,
      ipv6: null,
      redirect: null,
      failure: {
        stage: "dns",
        kind: "dns_not_found",
        user_message: "DNS resolution failed",
        technical_message: "failed to lookup address information: Host not found",
        error_chain: ["failed to lookup address information: Host not found"],
        errno: null,
        http_status: null,
        address: null,
        protocol: null,
        retryable: true,
        observed_at: "2026-07-17T12:00:01Z",
        confidence: "direct"
      },
      timings: { dns_ms: 10, tcp_ms: null, tls_ms: null, request_ms: null, total_ms: 10 },
      status: "failed",
      failure_stage: "dns",
      http_status: null,
      latency_ms: 10,
      error: "DNS resolution failed",
      error_code: "dns_not_found",
      timestamp: "2026-07-17T12:00:00Z",
      log: { steps: [] },
      final_url: null,
      redirect_count: null
    };

    const normalized = normalizeError(dnsFailure);
    expect(normalized).toBeDefined();
    expect(normalized?.code).toBe("dns_resolution_failed");
    expect(normalized?.category).toBe("dns");
    expect(normalized?.stage).toBe("dns");
    expect(normalized?.severity).toBe("high");
    expect(normalized?.retryable).toBe(true);
  });

  it("should normalize Connection Timeouts correctly", () => {
    const tcpTimeout: ProbeResult = {
      target_id: "google",
      target_url: "https://google.com",
      run_id: "run-1",
      started_at: "2026-07-17T12:00:00Z",
      completed_at: "2026-07-17T12:00:01Z",
      overall_status: "down",
      dns: null,
      tcp: null,
      tls: null,
      http: null,
      ipv4: null,
      ipv6: null,
      redirect: null,
      failure: {
        stage: "tcp",
        kind: "tcp_timeout",
        user_message: "TCP connection timed out",
        technical_message: "Connection timed out",
        error_chain: ["Connection timed out"],
        errno: null,
        http_status: null,
        address: "142.250.140.100:443",
        protocol: "ipv4",
        retryable: true,
        observed_at: "2026-07-17T12:00:01Z",
        confidence: "direct"
      },
      timings: { dns_ms: null, tcp_ms: null, tls_ms: null, request_ms: null, total_ms: 3000 },
      status: "failed",
      failure_stage: "tcp",
      http_status: null,
      latency_ms: 3000,
      error: "TCP connection timed out",
      error_code: "tcp_timeout",
      timestamp: "2026-07-17T12:00:00Z",
      log: { steps: [] },
      final_url: null,
      redirect_count: null
    };

    const normalized = normalizeError(tcpTimeout);
    expect(normalized).toBeDefined();
    expect(normalized?.code).toBe("connection_timeout");
    expect(normalized?.category).toBe("timeout");
    expect(normalized?.stage).toBe("connection");
    expect(normalized?.severity).toBe("high");
  });

  it("should normalize TLS handshakes correctly", () => {
    const tlsFailure: ProbeResult = {
      target_id: "google",
      target_url: "https://google.com",
      run_id: "run-1",
      started_at: "2026-07-17T12:00:00Z",
      completed_at: "2026-07-17T12:00:01Z",
      overall_status: "down",
      dns: null,
      tcp: null,
      tls: null,
      http: null,
      ipv4: null,
      ipv6: null,
      redirect: null,
      failure: {
        stage: "tls",
        kind: "tls_handshake",
        user_message: "TLS handshake failed",
        technical_message: "SSL handshake failed",
        error_chain: ["SSL handshake failed"],
        errno: null,
        http_status: null,
        address: null,
        protocol: null,
        retryable: true,
        observed_at: "2026-07-17T12:00:01Z",
        confidence: "direct"
      },
      timings: { dns_ms: null, tcp_ms: null, tls_ms: null, request_ms: null, total_ms: 120 },
      status: "failed",
      failure_stage: "tls",
      http_status: null,
      latency_ms: 120,
      error: "TLS handshake failed",
      error_code: "tls_handshake",
      timestamp: "2026-07-17T12:00:00Z",
      log: { steps: [] },
      final_url: null,
      redirect_count: null
    };

    const normalized = normalizeError(tlsFailure);
    expect(normalized).toBeDefined();
    expect(normalized?.code).toBe("tls_handshake_failed");
    expect(normalized?.category).toBe("tls");
    expect(normalized?.stage).toBe("tls");
    expect(normalized?.severity).toBe("high");
  });

  it("should normalize HTTP 4xx and 5xx correctly", () => {
    const http500Result: ProbeResult = {
      target_id: "google",
      target_url: "https://google.com",
      run_id: "run-1",
      started_at: "2026-07-17T12:00:00Z",
      completed_at: "2026-07-17T12:00:01Z",
      overall_status: "down",
      dns: null,
      tcp: null,
      tls: null,
      http: null,
      ipv4: null,
      ipv6: null,
      redirect: null,
      failure: {
        stage: "http",
        kind: "http_status",
        user_message: "HTTP server returned error status",
        technical_message: "Internal Server Error",
        error_chain: [],
        errno: null,
        http_status: 500,
        address: null,
        protocol: null,
        retryable: true,
        observed_at: "2026-07-17T12:00:01Z",
        confidence: "direct"
      },
      timings: { dns_ms: null, tcp_ms: null, tls_ms: null, request_ms: null, total_ms: 150 },
      status: "failed",
      failure_stage: "http",
      http_status: 500,
      latency_ms: 150,
      error: "HTTP response failure status: 500",
      error_code: "http_status",
      timestamp: "2026-07-17T12:00:00Z",
      log: { steps: [] },
      final_url: "https://google.com",
      redirect_count: 0
    };

    const normalized500 = normalizeError(http500Result);
    expect(normalized500?.code).toBe("http_5xx");
    expect(normalized500?.category).toBe("http");
    expect(normalized500?.severity).toBe("high");

    const http403Result = {
      ...http500Result,
      http_status: 403,
      failure: {
        ...http500Result.failure!,
        http_status: 403
      }
    };

    const normalized403 = normalizeError(http403Result);
    expect(normalized403?.code).toBe("http_4xx");
    expect(normalized403?.category).toBe("http");
    expect(normalized403?.severity).toBe("medium");
  });

  it("should fall back gracefully to unknown errors", () => {
    const unknownFailure: ProbeResult = {
      target_id: "google",
      target_url: "https://google.com",
      run_id: "run-1",
      started_at: "2026-07-17T12:00:00Z",
      completed_at: "2026-07-17T12:00:01Z",
      overall_status: "down",
      dns: null,
      tcp: null,
      tls: null,
      http: null,
      ipv4: null,
      ipv6: null,
      redirect: null,
      failure: null,
      timings: { dns_ms: null, tcp_ms: null, tls_ms: null, request_ms: null, total_ms: 80 },
      status: "failed",
      failure_stage: "unknown",
      http_status: null,
      latency_ms: 80,
      error: "Some mysterious OS error 0x80004005",
      error_code: null,
      timestamp: "2026-07-17T12:00:00Z",
      log: { steps: [] },
      final_url: null,
      redirect_count: null
    };

    const normalized = normalizeError(unknownFailure);
    expect(normalized).toBeDefined();
    expect(normalized?.code).toBe("unknown_error");
    expect(normalized?.stage).toBe("unknown");
    expect(normalized?.rawError).toBe("Some mysterious OS error 0x80004005");
  });
});
