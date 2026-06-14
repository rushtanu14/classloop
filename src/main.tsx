import React from "react";
import ReactDOM from "react-dom/client";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/react";
import App from "./App";
import "./styles.css";

const publicAnalyticsRoutes = new Set(["", "home", "features", "screenshots", "docs", "privacy", "terms", "eula", "support", "download"]);

function shouldEnableWebAnalytics() {
  if (!import.meta.env.PROD) return false;

  const { hostname, protocol } = window.location;
  if (protocol !== "https:") return false;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return false;

  return true;
}

function filterPublicAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = new URL(event.url);
  const route = url.hash.replace(/^#\/?/, "").split("?")[0].toLowerCase();

  if (!publicAnalyticsRoutes.has(route)) return null;

  url.search = "";
  url.hash = route ? `#/${route}` : "";

  return {
    ...event,
    url: url.toString(),
  };
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    {shouldEnableWebAnalytics() && <Analytics beforeSend={filterPublicAnalyticsEvent} />}
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
