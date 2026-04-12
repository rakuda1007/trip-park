import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export function GET() {
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
        <svg width="280" height="280" viewBox="0 0 512 512">
          {/* Mountain */}
          <polygon points="256,150 390,375 122,375" fill="white" fillOpacity="0.95" />
          <polygon points="315,235 390,375 235,375" fill="#0f766e" fillOpacity="0.4" />
          {/* Location pin */}
          <circle cx="256" cy="116" r="40" fill="white" />
          <circle cx="256" cy="116" r="20" fill="#0f766e" />
          <polygon points="256,172 232,126 280,126" fill="white" />
        </svg>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
