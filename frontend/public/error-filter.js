function describe(value) {
  if (value == null) return "Unknown frontend error";
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message || value.name;
  try { return JSON.stringify(value); }
  catch { return Object.prototype.toString.call(value); }
}

function handleError(event) {
  if (
    event.error instanceof DOMException &&
    event.error.name === "DataCloneError" &&
    event.message &&
    event.message.includes("PerformanceServerTiming")
  ) {
    event.stopImmediatePropagation();
    event.preventDefault();
    return;
  }

  // CRA's refresh overlay turns thrown plain objects into Error objects with
  // the message "[object Object]". Intercept the original event first so the
  // page stays usable and the useful payload remains visible in DevTools.
  if (event.error && !(event.error instanceof Error)) {
    console.error("[frontend error]", describe(event.error));
    event.stopImmediatePropagation();
    event.preventDefault();
  }
}

function handleUnhandledRejection(event) {
  const reason = event.reason;
  if (reason && !(reason instanceof Error)) {
    console.error("[unhandled rejection]", describe(reason));
    event.stopImmediatePropagation();
    event.preventDefault();
  }
}

window.addEventListener("error", handleError, true);
window.addEventListener("unhandledrejection", handleUnhandledRejection, true);