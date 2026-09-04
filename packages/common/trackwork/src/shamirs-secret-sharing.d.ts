declare module 'shamirs-secret-sharing' {
  export interface ShamirSplitOptions {
    shares: number;
    threshold: number;
    random?: (size: number) => Buffer | Uint8Array;
  }

  export interface ShamirSecretSharing {
    split(
      secret: Buffer | Uint8Array | string,
      options: ShamirSplitOptions
    ): Buffer[];
    combine(shares: Array<Buffer | Uint8Array | string>): Buffer;
  }

  const sss: ShamirSecretSharing;
  export default sss;
}