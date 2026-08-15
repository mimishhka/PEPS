window.addEventListener(
  "error",
  function handleError(event) {
    if (
      event.error instanceof DOMException &&
      event.error.name === "DataCloneError" &&
      event.message &&
      event.message.includes("PerformanceServerTiming")
    ) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  },
  true,
);