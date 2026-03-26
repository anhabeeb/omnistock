declare module "html5-qrcode" {
  export class Html5QrcodeScanner {
    constructor(
      elementId: string,
      config: { fps: number; qrbox: { width: number; height: number } },
      verbose?: boolean,
    );

    render(
      onSuccess: (decodedText: string, decodedResult?: unknown) => void,
      onError: (errorMessage: string, error?: unknown) => void,
    ): void;

    clear(): Promise<void>;
  }
}

declare module "html5-qrcode/esm/index.js" {
  export class Html5QrcodeScanner {
    constructor(
      elementId: string,
      config: { fps: number; qrbox: { width: number; height: number } },
      verbose?: boolean,
    );

    render(
      onSuccess: (decodedText: string, decodedResult?: unknown) => void,
      onError: (errorMessage: string, error?: unknown) => void,
    ): void;

    clear(): Promise<void>;
  }
}
