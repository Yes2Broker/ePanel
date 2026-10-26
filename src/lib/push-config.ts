// Web Push (VAPID) public key. Safe to share; the matching private key is
// VAPID_PRIVATE_KEY in Vercel and never leaves the server.
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BAmUvwlUz4gF9szvyVtD5UFrn2g8NSIJoDkNWzCI6SR1r0ce5Yyp5Ju-ij4z4WW1YJZPF2SmlmoTqHX2XrNtf6s";
