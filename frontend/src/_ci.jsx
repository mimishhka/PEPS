import { useState } from "react";
export default function CI({ actif }) {
  if (!actif) return null;
  const [x] = useState(0);
  return <div>{x}</div>;
}
