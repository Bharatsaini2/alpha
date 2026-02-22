declare module 'sharp' {
  interface SharpInstance {
    png(): SharpInstance
    toBuffer(): Promise<Buffer>
  }
  function sharp(input?: Buffer | ArrayBuffer | Uint8Array): SharpInstance
  export default sharp
}
