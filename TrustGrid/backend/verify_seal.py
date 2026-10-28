"""Check a downloaded seal file on any computer: python verify_seal.py 1234_seal.json [expected-fingerprint]"""
import sys, json, hashlib, base64
import pq
doc = json.load(open(sys.argv[1])); s = doc["seal"]
checks = {"payload hash matches": hashlib.sha256(s["payload"].encode()).hexdigest() == s["payload_sha256"],
          "key fingerprint matches": hashlib.sha256(base64.b64decode(s["public_key"])).hexdigest() == s["fingerprint"],
          "signature is valid": pq.verify(s["payload"], s["public_key"], s["signature"])}
if len(sys.argv) > 2: checks["fingerprint equals the one you trust"] = s["fingerprint"] == sys.argv[2]
for k, v in checks.items(): print(("OK   " if v else "FAIL ") + k)
print("Algorithm:", s["algorithm"], "| Signed:", s["signed_at"]); sys.exit(0 if all(checks.values()) else 1)
