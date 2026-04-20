import "@testing-library/jest-dom";

// ResizeObserver mock (jsdom에서 지원되지 않음)
if (!global.ResizeObserver) {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
}

// window.open mock (jsdom 기본 구현은 호출 시 예외 발생)
Object.defineProperty(window, "open", {
  writable: true,
  value: () => null,
});

// IntersectionObserver mock (jsdom에서 지원되지 않음)
if (!global.IntersectionObserver) {
  global.IntersectionObserver = class IntersectionObserver {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
}
