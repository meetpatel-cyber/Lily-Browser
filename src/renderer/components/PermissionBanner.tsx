import "./PermissionBanner.css";
import type { PendingPermission } from "../../shared/browser";
import { Icon } from "./Icon";

interface PermissionBannerProps {
  request: PendingPermission;
  onResolve: (reqId: string, decision: "allow" | "block" | "dismiss") => void;
}

export function PermissionBanner({ request, onResolve }: PermissionBannerProps) {
  let icon = <Icon name="lock" size={16} />;
  let categoryLabel = "a permission";

  if (request.category === "camera") {
    icon = <Icon name="camera" size={16} />;
    categoryLabel = "your camera";
  } else if (request.category === "microphone") {
    icon = <Icon name="microphone" size={16} />;
    categoryLabel = "your microphone";
  } else if (request.category === "cameraAndMicrophone") {
    icon = <Icon name="camera" size={16} />;
    categoryLabel = "your camera and microphone";
  } else if (request.category === "notifications") {
    icon = <Icon name="bell" size={16} />;
    categoryLabel = "notifications";
  } else if (request.category === "geolocation") {
    icon = <Icon name="map-pin" size={16} />;
    categoryLabel = "your location";
  }

  // Remove protocol for cleaner display
  const displayOrigin = request.origin.replace(/^https?:\/\//, "");

  return (
    <div className="permission-banner">
      <div className="permission-banner-content">
        <span className="permission-banner-icon">{icon}</span>
        <div className="permission-banner-text" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span><strong>{displayOrigin}</strong> wants to use {categoryLabel}</span>
          <span style={{ fontSize: "12px", color: "var(--fg-secondary)" }}>Allow this site to access {categoryLabel}?</span>
        </div>
      </div>
      <div className="permission-banner-actions">
        <button className="permission-banner-btn primary" onClick={() => onResolve(request.id, "allow")}>Allow</button>
        <button className="permission-banner-btn" onClick={() => onResolve(request.id, "block")}>Block</button>
        <button className="permission-banner-btn icon-only" onClick={() => onResolve(request.id, "dismiss")} aria-label="Dismiss">
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  );
}
