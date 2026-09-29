declare module "potrace" {
  export class Potrace {
    constructor(options?: Record<string, unknown>);
    loadImage(target: Buffer | string, callback: (err: Error | null) => void): void;
    getPathTag(fillColor?: string, scale?: { x: number; y: number }): string;
    getSVG(): string;
  }
}
