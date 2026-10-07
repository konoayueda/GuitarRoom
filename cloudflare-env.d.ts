declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GUITAR_ROOM_LOCAL_APP?: string;
  }
}
