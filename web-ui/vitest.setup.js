import { vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};

global.localStorage = localStorageMock;

// Mock window.location with proper URL
const mockLocation = new URL('http://localhost:5173/');
delete global.window.location;
global.window.location = mockLocation;

// Mock window.confirm for dialogs
global.window.confirm = vi.fn(() => true);

// Mock window.URL.createObjectURL for Plotly.js
if (typeof window.URL.createObjectURL === 'undefined') {
  window.URL.createObjectURL = vi.fn(() => 'mock-url');
}
if (typeof window.URL.revokeObjectURL === 'undefined') {
  window.URL.revokeObjectURL = vi.fn();
}

// Mock IntersectionObserver (used by some Vue components)
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
};

// Mock axios to prevent real HTTP requests
vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn(() => ({
        get: vi.fn(() => Promise.resolve({ data: [] })),
        post: vi.fn(() => Promise.resolve({ data: {} })),
        put: vi.fn(() => Promise.resolve({ data: {} })),
        delete: vi.fn(() => Promise.resolve({ data: {} })),
        interceptors: {
          request: { use: vi.fn(), eject: vi.fn() },
          response: { use: vi.fn(), eject: vi.fn() }
        }
      })),
      get: vi.fn(() => Promise.resolve({ data: [] })),
      post: vi.fn(() => Promise.resolve({ data: {} })),
      put: vi.fn(() => Promise.resolve({ data: {} })),
      delete: vi.fn(() => Promise.resolve({ data: {} }))
    }
  };
});
