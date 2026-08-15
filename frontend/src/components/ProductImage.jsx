import { useState } from "react";
import { VialArt } from "./brand";
import { resolveAssetUrl } from "../lib/api";

function hueFor(slug = "") {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
  return 190 + (h % 40);
}

/**
 * ProductImage — renders the product's stored image, falling back to the
 * brand VialArt SVG on load error or missing URL. Keeps every product tile
 * looking good even when an uploaded file has gone missing on disk.
 */
export default function ProductImage({
  src,
  slug = "",
  alt = "",
  className = "",
  imgClassName = "",
  loading = "lazy",
  fetchPriority = "auto",
  width,
  height,
}) {
  const resolved = resolveAssetUrl(src);
  const [failed, setFailed] = useState(false);

  if (!resolved || failed) {
    return <VialArt hue={hueFor(slug)} className={className} />;
  }
  return (
    <img
      src={resolved}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      fetchPriority={fetchPriority}
      decoding="async"
      onError={() => setFailed(true)}
      className={imgClassName || className}
    />
  );
}
