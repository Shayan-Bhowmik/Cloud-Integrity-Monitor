import "@testing-library/jest-dom/vitest";

// jsdom has no WebGL; return null so components take their documented no-WebGL fallback quietly.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
