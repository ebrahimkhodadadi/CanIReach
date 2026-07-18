import { ProbeResult } from "../features/probes/types";

export interface StatusDisplayInfo {
  emoji: string;
  color: string;
  bg: string;
  text: string;
  badgeColor: string;
}

export const getStatusDisplayInfo = (
  isProbing: boolean,
  result: ProbeResult | undefined
): StatusDisplayInfo => {
  if (isProbing) {
    return {
      emoji: "⏳",
      color: "text-amber-400 bg-amber-400/10 border-amber-400/20",
      bg: "bg-amber-400/5",
      text: "Testing...",
      badgeColor: "bg-amber-500/20 text-amber-300",
    };
  }

  if (!result) {
    return {
      emoji: "💤",
      color: "text-slate-400 bg-slate-400/10 border-slate-400/20",
      bg: "bg-slate-400/5",
      text: "Idle",
      badgeColor: "bg-slate-500/20 text-slate-300",
    };
  }

  if (result.status === "success") {
    return {
      emoji: "✅",
      color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
      bg: "bg-emerald-400/5",
      text: result.http_status ? `Reachable (${result.http_status})` : "Reachable",
      badgeColor: "bg-emerald-500/20 text-emerald-300",
    };
  }

  switch (result.failure_stage) {
    case "dns":
      return {
        emoji: "❌",
        color: "text-rose-500 bg-rose-500/10 border-rose-500/20",
        bg: "bg-rose-500/5",
        text: "DNS Resolution Failed",
        badgeColor: "bg-rose-500/20 text-rose-300",
      };
    case "tcp":
      return {
        emoji: "❌",
        color: "text-rose-500 bg-rose-500/10 border-rose-500/20",
        bg: "bg-rose-500/5",
        text: "TCP Connection Failed",
        badgeColor: "bg-rose-500/20 text-rose-300",
      };
    case "tls":
      return {
        emoji: "❌",
        color: "text-rose-500 bg-rose-500/10 border-rose-500/20",
        bg: "bg-rose-500/5",
        text: "TLS Handshake Failed",
        badgeColor: "bg-rose-500/20 text-rose-300",
      };
    case "timeout":
      return {
        emoji: "❌",
        color: "text-rose-500 bg-rose-500/10 border-rose-500/20",
        bg: "bg-rose-500/5",
        text: "Request Timeout",
        badgeColor: "bg-rose-500/20 text-rose-300",
      };
    case "redirect":
      return {
        emoji: "❌",
        color: "text-rose-500 bg-rose-500/10 border-rose-500/20",
        bg: "bg-rose-500/5",
        text: "Redirect Loop / Failure",
        badgeColor: "bg-rose-500/20 text-rose-300",
      };
    case "http":
      return {
        emoji: "❌",
        color: "text-rose-500 bg-rose-500/10 border-rose-500/20",
        bg: "bg-rose-500/5",
        text: result.http_status ? `HTTP ${result.http_status} Response` : "HTTP Request Error",
        badgeColor: "bg-rose-500/20 text-rose-300",
      };
    case "configuration":
      return {
        emoji: "❌",
        color: "text-rose-500 bg-rose-500/10 border-rose-500/20",
        bg: "bg-rose-500/5",
        text: "Invalid Configuration",
        badgeColor: "bg-rose-500/20 text-rose-300",
      };
    default:
      return {
        emoji: "❌",
        color: "text-rose-500 bg-rose-500/10 border-rose-500/20",
        bg: "bg-rose-500/5",
        text: "Request Failed",
        badgeColor: "bg-rose-500/20 text-rose-300",
      };
  }
};
