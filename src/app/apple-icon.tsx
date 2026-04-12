import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#0f766e",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 512 512">
          {/* Mountain */}
          <polygon points="256,140 390,375 122,375" fill="white" fillOpacity="0.95" />
          <polygon points="310,230 390,375 230,375" fill="#0f766e" fillOpacity="0.4" />
          {/* Location pin */}
          <circle cx="256" cy="106" r="40" fill="white" />
          <circle cx="256" cy="106" r="20" fill="#0f766e" />
          <polygon points="256,162 232,116 280,116" fill="white" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
