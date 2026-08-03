import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1c5cab",
          color: "white",
          fontFamily: "monospace",
          fontWeight: 900,
          fontSize: 18,
          borderRadius: 6,
        }}
      >
        BX
      </div>
    ),
    { ...size }
  );
}
