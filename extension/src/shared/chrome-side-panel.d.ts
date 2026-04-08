/**
 * Type declarations for the chrome.sidePanel API.
 *
 * The @types/chrome package may not include sidePanel definitions for
 * all versions. This declaration file ensures type safety without
 * requiring `any` casts throughout the codebase.
 */

declare namespace chrome {
  namespace sidePanel {
    interface OpenOptions {
      windowId?: number;
      tabId?: number;
    }

    function open(options?: OpenOptions): Promise<void>;
    function setOptions(options: {
      path?: string;
      enabled?: boolean;
      tabId?: number;
    }): Promise<void>;
    function getOptions(options?: {
      tabId?: number;
    }): Promise<{ path?: string; enabled?: boolean }>;
    function setPanelBehavior(behavior: {
      openPanelOnActionClick?: boolean;
    }): Promise<void>;
  }
}
