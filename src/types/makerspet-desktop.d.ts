export {};

declare global {
  interface Window {
    makersPetDesktop?: {
      getState: () => Promise<{
        ok: boolean;
        pinned: boolean;
        baseUrl?: string;
      }>;
      fitWindow: (payload: {
        width: number;
        height: number;
      }) => Promise<{
        ok: boolean;
      }>;
      dragWindow: (payload: {
        phase: "start" | "move" | "end";
        pointerX: number;
        pointerY: number;
      }) => Promise<{
        ok: boolean;
      }>;
      sendDragWindow: (payload: {
        phase: "start" | "move" | "end";
        pointerX: number;
        pointerY: number;
      }) => void;
      togglePinned: () => Promise<{
        ok: boolean;
        pinned: boolean;
      }>;
      minimize: () => Promise<{
        ok: boolean;
      }>;
      showContextMenu: (labels: {
        openChat: string;
        openAdmin: string;
        pin: string;
        unpin: string;
        minimize: string;
        quit: string;
      }) => Promise<{
        ok: boolean;
      }>;
      openRoute: (routePath: string) => Promise<{
        ok: boolean;
      }>;
      openExternal: (target: string) => Promise<{
        ok: boolean;
      }>;
    };
  }
}
