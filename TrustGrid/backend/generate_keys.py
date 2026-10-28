"""Optional, run once: python generate_keys.py
Prints PQ_PUBLIC_KEY and PQ_SECRET_KEY. Add both as Render environment variables so the signing key never changes."""
import pq
pq.need_lib()
pk, sk = pq.SCHEME.keygen()
print("PQ_PUBLIC_KEY=" + pq.b64(pk)); print("PQ_SECRET_KEY=" + pq.b64(sk))
